using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Utils;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

#pragma warning disable CS8981
using r = TelecomBoliviaNet.Domain.Primitives.Result;
#pragma warning restore CS8981

namespace TelecomBoliviaNet.Application.Services.Invoices;

/// <summary>
/// Cambios de estado sobre facturas YA emitidas: marcar vencidas en lote y
/// anular una concreta.
///
/// <para>Extraído de <c>BillingService</c> (F5), que además las generaba. Los dos
/// métodos van juntos porque comparten lo que de verdad los caracteriza: son los
/// únicos de facturación que pelean con el token de concurrencia de
/// <c>Invoice</c>, y ambos dejan asiento de auditoría de un cambio de estado que
/// el cliente va a notar.</para>
/// </summary>
public class InvoiceStatusService : IInvoiceStatusService
{
    private readonly IGenericRepository<Invoice>     _invoiceRepo;
    private readonly IGenericRepository<Client>      _clientRepo;
    private readonly INotifPublisher                 _notif;
    private readonly AuditService                    _audit;
    private readonly ILogger<InvoiceStatusService>   _logger;

    public InvoiceStatusService(
        IGenericRepository<Invoice>   invoiceRepo,
        IGenericRepository<Client>    clientRepo,
        INotifPublisher               notif,
        AuditService                  audit,
        ILogger<InvoiceStatusService> logger)
    {
        _invoiceRepo = invoiceRepo;
        _clientRepo  = clientRepo;
        _notif       = notif;
        _audit       = audit;
        _logger      = logger;
    }

    private static string MonthName(int month) => InvoiceHelper.MonthName(month);

    public async Task<int> MarkOverdueInvoicesAsync(
        Guid? actorId = null, string actorName = "Sistema")
    {
        var now = DateTime.UtcNow;

        var overdue = await _invoiceRepo.GetAll()
            .Where(i => InvoiceDomainService.OverdueEligible.Contains(i.Status) && i.DueDate < now)
            .ToListAsync();

        if (overdue.Count == 0) return 0;

        var porCliente = overdue.GroupBy(i => i.ClientId).ToList();

        foreach (var invoice in overdue)
        {
            invoice.Status    = InvoiceStatus.Vencida;
            invoice.UpdatedAt = now;
        }

        _invoiceRepo.UpdateRange(overdue);

        try
        {
            await _invoiceRepo.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException ex)
        {
            // D-14: desde que Invoice lleva token de concurrencia, este lote puede
            // chocar con un cobro que se registró mientras el job leía. Antes el
            // choque no existía porque el job simplemente PISABA el cobro.
            //
            // Se recargan las filas en conflicto desde la base y se descarta el
            // marcado de esas: si alguien acaba de pagarlas, no corresponde
            // marcarlas vencidas. El resto del lote sí se confirma — un cobro
            // simultáneo no debe impedir que se marquen las otras mil facturas.
            var enConflicto = ex.Entries.Select(e => e.Entity).OfType<Invoice>().ToList();

            foreach (var entry in ex.Entries)
                await entry.ReloadAsync();

            // Las recargadas vuelven a su estado real en base; se sacan del lote.
            var idsEnConflicto = enConflicto.Select(i => i.Id).ToHashSet();
            overdue    = overdue.Where(i => !idsEnConflicto.Contains(i.Id)).ToList();
            porCliente = overdue.GroupBy(i => i.ClientId).ToList();

            _logger.LogWarning(
                "MarkOverdueInvoicesAsync: {Count} factura(s) cambiaron mientras se " +
                "marcaban (probablemente un cobro simultáneo). Se omiten y se " +
                "reintentarán en la próxima corrida: {Ids}",
                idsEnConflicto.Count, string.Join(", ", idsEnConflicto));

            await _invoiceRepo.SaveChangesAsync();
        }

        var clientIds = porCliente.Select(g => g.Key).ToList();
        var clientsById = await _clientRepo.GetAll()
            .Include(c => c.Plan)
            .Where(c => clientIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id);

        var cultura = new CultureInfo("es-BO");
        foreach (var grupo in porCliente)
        {
            clientsById.TryGetValue(grupo.Key, out var client);

            if (client is not null)
            {
                var saldoPendienteTotal = grupo.Sum(i => i.Amount - i.AmountPaid);
                var periodo = grupo.Count() == 1
                    ? new DateTime(grupo.First().Year, grupo.First().Month, 1).ToString("MMMM yyyy", cultura)
                    : $"{grupo.Count()} meses";

                await _notif.PublishAsync(
                    NotifType.FACTURA_VENCIDA,
                    client.Id,
                    client.PhoneMain,
                    new Dictionary<string, string>
                    {
                        ["nombre"]  = client.FullName,
                        ["monto"]   = $"{saldoPendienteTotal:F2}",
                        ["periodo"] = periodo,
                        ["plan"]    = client.Plan?.Name ?? "internet",
                    },
                    referenciaId: grupo.First().Id);
            }
        }

        await _audit.LogAsync(
            "Facturación", "OVERDUE_JOB_EXECUTED",
            $"{overdue.Count} facturas marcadas como vencidas al {now:dd/MM/yyyy}. Notificaciones encoladas: {porCliente.Count}.",
            userId: actorId, userName: actorName,
            newData: System.Text.Json.JsonSerializer.Serialize(new { Count = overdue.Count, Date = now }));

        return overdue.Count;
    }


    public async Task<r> VoidInvoiceAsync(
        Guid invoiceId, string justification, Guid actorId, string actorName, string ip)
    {
        var invoice = await _invoiceRepo.GetAll()
            .Include(i => i.Client)
            .FirstOrDefaultAsync(i => i.Id == invoiceId);

        if (invoice is null)                                   return Result.Failure("Factura no encontrada.");
        if (invoice.Status == InvoiceStatus.Pagada)            return Result.Failure("No se puede anular una factura pagada.");
        if (invoice.Status == InvoiceStatus.Anulada)           return Result.Failure("La factura ya está anulada.");
        if (justification.Trim().Length < 10)                  return Result.Failure("La justificación debe tener al menos 10 caracteres.");

        var prevStatus    = invoice.Status.ToString();
        invoice.Status    = InvoiceStatus.Anulada;
        // Se ANEXA en vez de sobrescribir: antes la justificación pisaba la nota
        // existente (p. ej. "Mes proporcional: 12 de 31 días"), destruyendo el
        // registro de cómo se calculó el importe.
        var anulacionNote = $"[ANULADA {DateTime.UtcNow:dd/MM/yyyy}] {justification.Trim()}";
        invoice.Notes     = string.IsNullOrWhiteSpace(invoice.Notes)
            ? anulacionNote
            : $"{invoice.Notes}\n{anulacionNote}";
        invoice.UpdatedAt = DateTime.UtcNow;
        _invoiceRepo.Update(invoice);
        await _invoiceRepo.SaveChangesAsync();
        await _audit.LogAsync(
            "Facturación", "INVOICE_VOIDED",
            $"Factura anulada: {invoice.Client?.TbnCode} — {MonthName(invoice.Month)} {invoice.Year}",
            userId: actorId, userName: actorName, ip: ip,
            prevData: System.Text.Json.JsonSerializer.Serialize(new { Status = prevStatus }),
            newData:  System.Text.Json.JsonSerializer.Serialize(new { Status = "Anulada", Justification = justification }));

        return Result.Success();
    }
}
