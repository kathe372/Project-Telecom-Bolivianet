using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Application.Constants;

namespace TelecomBoliviaNet.Application.Services.Invoices;

/// <summary>
/// Los tres informes de facturación: el calendario anual por cliente, la lista
/// de morosos y las filas que se exportan a archivo.
///
/// <para>Extraído de <c>InvoiceQueryService</c> (F5). Son los únicos de ese
/// módulo que cruzan facturas con clientes, y los únicos que devuelven algo
/// pensado para leerse fuera de la aplicación.</para>
/// </summary>
public class InvoiceReportService : IInvoiceReportService
{
    private readonly IGenericRepository<Invoice> _invoiceRepo;
    private readonly IGenericRepository<Client>  _clientRepo;

    public InvoiceReportService(
        IGenericRepository<Invoice> invoiceRepo,
        IGenericRepository<Client>  clientRepo)
    {
        _invoiceRepo = invoiceRepo;
        _clientRepo  = clientRepo;
    }

    public async Task<IEnumerable<AnnualReportRowDto>> GetAnnualReportAsync(AnnualReportFilterDto filter)
    {
        var clientsQuery = _clientRepo.GetAll()
            .Include(c => c.Plan)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(filter.Zone))
        {
            var zone      = filter.Zone.Trim();
            var zoneLower = zone.ToLower();
            clientsQuery = clientsQuery.Where(c =>
                c.Zone.ToLower().StartsWith(zoneLower) || c.Zone == zone);
        }

        if (filter.PlanId.HasValue)
            clientsQuery = clientsQuery.Where(c => c.PlanId == filter.PlanId.Value);

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var s = filter.Search.Trim().ToLower();
            clientsQuery = clientsQuery.Where(c =>
                c.FullName.ToLower().Contains(s) || c.TbnCode.ToLower().Contains(s));
        }

        clientsQuery = filter.SortBy == "name"
            ? clientsQuery.OrderBy(c => c.FullName)
            : clientsQuery.OrderBy(c => c.TbnCode);

        var clients = await clientsQuery.ToListAsync();

        var clientIds = clients.Select(c => c.Id).ToList();
        var invoices  = await _invoiceRepo.GetAll()
            .Include(i => i.PaymentInvoices).ThenInclude(pi => pi.Payment)
            .Where(i => clientIds.Contains(i.ClientId) &&
                        (i.Year == filter.Year || i.Type == InvoiceType.Instalacion))
            .ToListAsync();

        var rows = new List<AnnualReportRowDto>();

        foreach (var client in clients)
        {
            var clientInvoices = invoices.Where(i => i.ClientId == client.Id).ToList();

            // Fuente única de deuda (InvoiceDomainService.UnpaidStatuses): antes este
            // filtro omitía Emitida/Enviada/ParcialmentePagada, así que el reporte anual
            // no coincidía con la pantalla de Deudores para el mismo cliente.
            var debt = clientInvoices.Sum(i => i.Outstanding);

            if (filter.DebtFilter == "paid"  && debt > 0) continue;
            if (filter.DebtFilter == "debt"  && debt == 0) continue;

            var cells = new List<AnnualReportCellDto>();

            var instInvoice = clientInvoices.FirstOrDefault(i => i.Type == InvoiceType.Instalacion);
            cells.Add(InvoiceProjections.BuildCell(0, "Instalación", instInvoice));

            for (int m = 1; m <= 12; m++)
            {
                var monthInvoice = clientInvoices
                    .FirstOrDefault(i => i.Year == filter.Year && i.Month == m
                                        && i.Type == InvoiceType.Mensualidad);

                if (monthInvoice is null)
                {
                    var installDate = client.InstallationDate;
                    var isBeforeInstall = new DateTime(filter.Year, m, 1) < new DateTime(installDate.Year, installDate.Month, 1);
                    cells.Add(new AnnualReportCellDto(m, InvoiceProjections.MonthNames[m],
                        isBeforeInstall ? "NoAplica" : "NoGenerada", 0, null, null, null));
                }
                else
                {
                    cells.Add(InvoiceProjections.BuildCell(m, InvoiceProjections.MonthNames[m], monthInvoice));
                }
            }

            rows.Add(new AnnualReportRowDto(
                client.Id, client.TbnCode, client.FullName,
                client.Zone, client.Plan?.Name ?? AppConstants.Display.SinDato, cells));
        }

        return rows;
    }


    public async Task<IEnumerable<DebtorDto>> GetDebtorsAsync(
        string?   search = null,
        DateTime? from   = null,
        DateTime? to     = null)
    {
        // UnpaidStatuses se traduce a IN (...) en SQL. Antes esta lista omitía
        // ParcialmentePagada, así que un cliente que pagaba a medias desaparecía
        // del reporte de deudores y su saldo remanente no se volvía a cobrar.
        var unpaid = InvoiceDomainService.UnpaidStatuses;
        var query = _invoiceRepo.GetAll()
            .Include(i => i.Client).ThenInclude(c => c!.Plan)
            .Where(i => i.Type == InvoiceType.Mensualidad && unpaid.Contains(i.Status));

        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.ToLower();
            query = query.Where(i =>
                i.Client != null &&
                (i.Client.FullName.ToLower().Contains(q) ||
                 i.Client.TbnCode.ToLower().Contains(q)));
        }

        if (from.HasValue)
            query = query.Where(i => i.DueDate >= from.Value);

        if (to.HasValue)
        {
            var toEnd = to.Value.Date.AddDays(1);
            query = query.Where(i => i.DueDate < toEnd);
        }

        var invoices = await query.ToListAsync();

        return invoices
            .GroupBy(i => i.ClientId)
            .Select(g =>
            {
                var client   = g.First().Client!;
                var facturas = g.OrderBy(i => i.Year).ThenBy(i => i.Month).ToList();
                return new DebtorDto(
                    client.Id,
                    client.TbnCode,
                    client.FullName,
                    client.Zone,
                    client.Plan?.Name ?? AppConstants.Display.SinDato,
                    facturas.Count,
                    facturas.Sum(i => i.Outstanding),
                    facturas.Max(i => i.DueDate),
                    facturas.Select(i => new InvoicePendienteDto(
                        i.Id,
                        i.InvoiceNumber ?? AppConstants.Display.SinDato,
                        InvoiceStatusResolver.EffectiveName(i, DateTime.UtcNow),
                        i.Year, i.Month,
                        i.Amount, i.DueDate, i.Notes)));
            })
            .OrderByDescending(d => d.TotalDeuda)
            .ToList();
    }


    public async Task<IEnumerable<InvoiceLegacyListItemDto>> GetAllForExportAsync(
        int year, int month, string? type = null, string? status = null, string? search = null)
    {
        // Antes esto forzaba Type == Mensualidad mientras el encabezado del reporte
        // se calculaba con GetMonthStatsAsync, que suma TODOS los tipos: el "Total
        // facturado" incluía reconexiones, equipos e instalaciones que no salían en
        // ninguna fila. Ahora el tipo llega por parámetro, igual que en la pantalla.
        var query = InvoiceQuerySpecs.ApplyTypeFilter(
            _invoiceRepo.GetAll()
                .Include(i => i.Client).ThenInclude(c => c!.Plan)
                .Include(i => i.PaymentInvoices).ThenInclude(pi => pi.Payment)
                .Where(i => i.Year == year && i.Month == month),
            type);

        if (!string.IsNullOrWhiteSpace(status) && status != "all"
            && Enum.TryParse<InvoiceStatus>(status, ignoreCase: true, out var parsedStatus))
            query = query.Where(i => i.Status == parsedStatus);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var q      = search.Trim();
            var qLower = q.ToLower();
            query = query.Where(i =>
                i.Client != null && (
                    i.Client.TbnCode == q ||
                    i.Client.TbnCode.ToLower().StartsWith(qLower) ||
                    i.Client.FullName.ToLower().Contains(qLower)));
        }

        var invoices = await query
            .OrderBy(i => i.Client!.TbnCode)
            .ToListAsync();

        var now = DateTime.UtcNow;
        return invoices.Select(i =>
        {
            var payment = InvoiceProjections.LivePaymentOf(i);
            // Cualquier factura con saldo y vencida acumula mora, no solo las que
            // el job ya marcó como Vencida: una Enviada de hace 40 días mostraba 0.
            var daysOverdue = i.IsUnpaid && now > i.DueDate
                ? (int)(now - i.DueDate).TotalDays
                : 0;
            return new InvoiceLegacyListItemDto(
                i.Id,
                i.Client?.TbnCode    ?? AppConstants.Display.SinDato,
                i.Client?.FullName   ?? AppConstants.Display.SinDato,
                i.Client?.Plan?.Name ?? i.PlanName ?? AppConstants.Display.SinDato,
                i.Amount,
                i.Type.ToString(),
                i.Status.ToString(),
                i.Year, i.Month,
                i.IssuedAt, i.DueDate,
                i.Notes,
                payment?.Id,   // el mismo pago vigente, no el primer enlace sin filtrar
                i.InvoiceNumber,
                i.Client?.Zone ?? AppConstants.Display.SinDato,
                i.AmountPaid,
                payment?.PaidAt,
                daysOverdue);
        });
    }


    /// <summary>
    /// Pago vigente que saldó la factura. Antes se tomaba el primero sin más:
    /// una factura pagada con un pago posteriormente ANULADO seguía mostrando ese
    /// pago, con su método y su fecha, como si siguiera siendo válido.
    /// </summary>
}
