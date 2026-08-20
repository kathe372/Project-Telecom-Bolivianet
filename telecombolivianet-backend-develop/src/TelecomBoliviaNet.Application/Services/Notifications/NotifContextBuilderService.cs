using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Services.Notifications;

public class NotifContextBuilderService
{
    private static readonly string[] SpanishMonths =
    {
        "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    };

    private readonly IGenericRepository<Client>      _clientRepo;
    private readonly IGenericRepository<Invoice>     _invoiceRepo;
    private readonly IGenericRepository<ClientQr>   _qrRepo;
    private readonly IGenericRepository<SystemConfig> _sysConfigRepo;
    private readonly IConfiguration                   _configuration;

    public NotifContextBuilderService(
        IGenericRepository<Client>       clientRepo,
        IGenericRepository<Invoice>      invoiceRepo,
        IGenericRepository<ClientQr>    qrRepo,
        IGenericRepository<SystemConfig>  sysConfigRepo,
        IConfiguration                    configuration)
    {
        _clientRepo    = clientRepo;
        _invoiceRepo   = invoiceRepo;
        _qrRepo        = qrRepo;
        _sysConfigRepo = sysConfigRepo;
        _configuration = configuration;
    }

    public virtual async Task<Dictionary<string, string>> BuildAsync(
        Guid    clienteId,
        Guid?   ticketId      = null,
        string? tecnicoNombre = null,
        DateTime? fechaVisita = null)
    {
        var client = await _clientRepo.GetAll()
            .Include(c => c.Plan)
            .FirstOrDefaultAsync(c => c.Id == clienteId);

        if (client is null) return new Dictionary<string, string>();

        // Fuente única de verdad de la deuda (InvoiceDomainService.UnpaidStatuses): se traduce a
        // IN (...) en SQL. Antes este filtro omitía Emitida y Enviada — justo los estados en que
        // nace una factura recién generada —, así que del día 1 al 5 de cada mes TODAS las
        // variables de plantilla ({{deuda}}, {{meses_deuda_detalle}}, {{monto}}…) salían en cero
        // y el recordatorio llegaba al cliente diciendo que no debe nada.
        var unpaid = InvoiceDomainService.UnpaidStatuses;
        var invoicesPendientes = await _invoiceRepo.GetAll()
            .Where(i => i.ClientId == clienteId
                     && !i.IsDeleted
                     && unpaid.Contains(i.Status))
            .OrderBy(i => i.DueDate)
            .ToListAsync();

        var deudaTotal = invoicesPendientes.Sum(i => i.Outstanding);
        var primerFactura = invoicesPendientes.FirstOrDefault();

        var diasMora = invoicesPendientes.Any()
            ? Math.Max(0, (int)(DateTime.UtcNow - invoicesPendientes.Min(i => i.DueDate)).TotalDays)
            : 0;

        var mesesMora = diasMora / 30;

        var mesesDeudaDetalle = BuildDebtMonthsDetail(invoicesPendientes);

        var qrEnlace = await BuildQrEnlaceAsync(clienteId);

        var empresaNombre = await GetEmpresaNombreAsync();

        var partes = (client.FullName ?? string.Empty).Split(' ', 2, StringSplitOptions.TrimEntries);

        return new Dictionary<string, string>
        {
            ["nombre"]               = partes.Length > 0 ? partes[0] : client.FullName ?? string.Empty,
            ["apellido"]             = partes.Length > 1 ? partes[1] : string.Empty,
            ["nombre_completo"]      = client.FullName ?? string.Empty,
            ["deuda"]                = deudaTotal.ToString("F2"),
            ["monto"]                = primerFactura is not null
                                          ? primerFactura.Outstanding.ToString("F2")
                                          : "0.00",
            ["periodo"]              = primerFactura is not null
                                          ? BuildPeriodoLabel(primerFactura)
                                          : string.Empty,
            ["fecha_vencimiento"]    = primerFactura?.DueDate.ToString("dd/MM/yyyy") ?? string.Empty,
            ["plan"]                 = client.Plan?.Name ?? string.Empty,
            ["zona"]                 = client.Zone ?? string.Empty,
            ["empresa"]              = empresaNombre,
            ["dias_mora"]            = diasMora.ToString(),
            ["meses_mora"]           = mesesMora.ToString(),
            ["meses_pendientes"]     = invoicesPendientes.Count.ToString(),
            ["fecha_corte"]          = await GetFechaCorteAsync(),
            ["num_ticket"]           = ticketId.HasValue ? ticketId.Value.ToString() : string.Empty,
            ["tecnico"]              = tecnicoNombre ?? string.Empty,
            ["fecha_visita"]         = fechaVisita?.ToString("dd/MM/yyyy") ?? string.Empty,
            ["meses_deuda_detalle"]  = mesesDeudaDetalle,
            ["qr_enlace"]            = qrEnlace,
        };
    }


    private static string BuildDebtMonthsDetail(List<Invoice> invoices)
    {
        if (!invoices.Any()) return "_(Sin facturas pendientes)_";

        var ahora = DateTime.UtcNow;

        var lineas = invoices.Select(inv =>
        {
            var saldo = inv.Outstanding;
            var label = inv.Type == InvoiceType.Instalacion
                ? "Instalación"
                : inv.Month is >= 1 and <= 12
                    ? $"{SpanishMonths[inv.Month]} {inv.Year}"
                    : $"{inv.Year}";

            // Estado EFECTIVO: una factura Emitida cuyo vencimiento ya pasó está vencida aunque
            // el job de marcado todavía no haya corrido. Antes se comparaba contra el estado
            // persistido y el mensaje decía "vence 05/08" con la fecha ya pasada.
            var vence = InvoiceStatusResolver.Effective(inv, ahora) == InvoiceStatus.Vencida
                ? $" _(vencida {inv.DueDate:dd/MM/yyyy})_"
                : $" _(vence {inv.DueDate:dd/MM/yyyy})_";

            return $"• *{label}* - Bs. {saldo:F2}{vence}";
        });

        return string.Join("\n", lineas);
    }

    private async Task<string> BuildQrEnlaceAsync(Guid clienteId)
    {
        var qr = await _qrRepo.GetAll()
            .Where(q => q.ClientId == clienteId
                     && q.IsActive
                     && (q.ExpiresAt == null || q.ExpiresAt > DateTime.UtcNow))
            .OrderByDescending(q => q.UploadedAt)
            .FirstOrDefaultAsync();

        if (qr is not null && !string.IsNullOrWhiteSpace(qr.ImageUrl))
        {
            var baseUrl = await GetBaseUrlAsync();
            return qr.ImageUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                ? qr.ImageUrl
                : $"{baseUrl.TrimEnd('/')}/{qr.ImageUrl.TrimStart('/')}";
        }

        var portalUrl = await GetConfigValueAsync("ISP:PortalPagoUrl");
        if (!string.IsNullOrWhiteSpace(portalUrl))
            return $"{portalUrl.TrimEnd('/')}/pay/{clienteId}";

        return "Contáctenos para obtener su código QR de pago.";
    }

    private static string BuildPeriodoLabel(Invoice inv)
    {
        if (inv.Type == InvoiceType.Instalacion) return "Instalación";
        return inv.Month is >= 1 and <= 12
            ? $"{SpanishMonths[inv.Month]} {inv.Year}"
            : inv.Year.ToString();
    }

    private async Task<string> GetEmpresaNombreAsync()
        => await GetConfigValueAsync("ISP:NombreEmpresa") ?? "TelecomBoliviaNet";

    private async Task<string> GetFechaCorteAsync()
        => await GetConfigValueAsync("ISP:FechaCorte") ?? string.Empty;

    private async Task<string> GetBaseUrlAsync()
    {
        // Prioridad: override por cliente en BD → env var → default de appsettings (App:BackendUrl).
        // El literal es solo el último recurso si falta la clave de configuración (dev local).
        var fromConfig = await GetConfigValueAsync("ISP:BackendUrl");
        return fromConfig
            ?? _configuration["BACKEND_PUBLIC_URL"]
            ?? _configuration["App:BackendUrl"]
            ?? "http://localhost:5000";
    }

    private async Task<string?> GetConfigValueAsync(string key)
    {
        var cfg = await _sysConfigRepo.GetAll()
            .FirstOrDefaultAsync(s => s.Key == key);
        return cfg?.Value;
    }
}
