using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Services.Invoices;

/// <summary>
/// Mover facturas ya emitidas de un estado a otro: una concreta, o todas las de
/// un mes al marcarlas como enviadas.
///
/// <para>Crear cargos extraordinarios y aplicar saldo a favor salieron de aquí
/// (F5) a <see cref="ExtraordinaryInvoiceService"/> e
/// <see cref="InvoiceCreditService"/>; eran 281 líneas bajo un nombre que no
/// decía cuál de las tres cosas hacía.</para>
///
/// <para>Distinto de <see cref="InvoiceStatusService"/>, que también cambia
/// estados pero por decisión del sistema —marcar vencidas en lote— o para
/// deshacer una factura.</para>
/// </summary>
public class InvoiceOperationsService : IInvoiceOperationsService
{
    private readonly IGenericRepository<Invoice>             _invoiceRepo;
    private readonly INotifPublisher                         _notif;
    private readonly AuditService                            _audit;
    private readonly ILogger<InvoiceOperationsService>       _logger;

    public InvoiceOperationsService(
        IGenericRepository<Invoice>       invoiceRepo,
        INotifPublisher                   notif,
        AuditService                      audit,
        ILogger<InvoiceOperationsService> logger)
    {
        _invoiceRepo = invoiceRepo;
        _notif       = notif;
        _audit       = audit;
        _logger      = logger;
    }

    public async Task<Result> TransicionarEstadoAsync(
        Guid invoiceId, InvoiceStatus nuevoEstado,
        Guid actorId, string actorName, string ip)
    {
        var invoice = await _invoiceRepo.GetAll()
            .Include(i => i.Client)
            .FirstOrDefaultAsync(i => i.Id == invoiceId);

        if (invoice is null) return Result.Failure("Factura no encontrada.");

        if (!InvoiceDomainService.TransicionEsValida(invoice.Status, nuevoEstado))
        {
            var permitidas = InvoiceDomainService.GetTransicionesPermitidas(invoice.Status);
            return Result.Failure(
                $"Transición no válida: {invoice.Status} → {nuevoEstado}. " +
                $"Estados permitidos: {string.Join(", ", permitidas)}");
        }

        var prevStatus = invoice.Status;
        invoice.Status    = nuevoEstado;
        invoice.UpdatedAt = DateTime.UtcNow;
        _invoiceRepo.Update(invoice);
        await _invoiceRepo.SaveChangesAsync();
        if (nuevoEstado == InvoiceStatus.Enviada && invoice.Client is not null)
        {
            try
            {
                await _notif.PublishAsync(
                    NotifType.RECORDATORIO_R1,
                    invoice.ClientId,
                    invoice.Client.PhoneMain,
                    new Dictionary<string, string>
                    {
                        ["nombre"]            = invoice.Client.FullName,
                        ["monto"]             = invoice.Amount.ToString("F2"),
                        ["periodo"]           = $"{invoice.Month}/{invoice.Year}",
                        ["fecha_vencimiento"] = invoice.DueDate.ToString("dd/MM/yyyy"),
                        ["meses_pendientes"]  = "1",
                    });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Best-effort: fallo al encolar recordatorio de factura {InvoiceId}",
                    invoice.Id);
            }
        }

        await _audit.LogAsync("Facturación", "INVOICE_STATUS_CHANGED",
            $"Estado factura {invoice.InvoiceNumber ?? invoice.Id.ToString()}: {prevStatus} → {nuevoEstado}",
            userId: actorId, userName: actorName, ip: ip,
            prevData: prevStatus.ToString(), newData: nuevoEstado.ToString());

        return Result.Success();
    }

    public async Task<int> MarkInvoicesSentAsync(
        int year, int month, Guid actorId, string actorName, string ip)
    {
        var facturas = await _invoiceRepo.GetAll()
            .Include(i => i.Client)
            .Where(i => i.Year == year && i.Month == month
                     && i.Status == InvoiceStatus.Emitida)
            .ToListAsync();

        foreach (var inv in facturas)
        {
            inv.Status    = InvoiceStatus.Enviada;
            inv.UpdatedAt = DateTime.UtcNow;
        }
        _invoiceRepo.UpdateRange(facturas);

        try
        {
            await _invoiceRepo.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException ex)
        {
            // D-14: una factura que cambió mientras se marcaban es, casi siempre,
            // una que acaban de cobrar — y una factura cobrada ya no es "Emitida",
            // así que no corresponde marcarla como enviada ni avisar de ella.
            // Se omite y el resto del lote se confirma.
            var idsEnConflicto = ex.Entries.Select(e => e.Entity).OfType<Invoice>()
                                   .Select(i => i.Id).ToHashSet();

            foreach (var entry in ex.Entries) await entry.ReloadAsync();

            facturas = facturas.Where(i => !idsEnConflicto.Contains(i.Id)).ToList();

            _logger.LogWarning(
                "MarkInvoicesSentAsync: {Count} factura(s) cambiaron mientras se marcaban " +
                "(probablemente un cobro simultáneo). Se omiten: {Ids}",
                idsEnConflicto.Count, string.Join(", ", idsEnConflicto));

            await _invoiceRepo.SaveChangesAsync();
        }

        foreach (var inv in facturas.Where(i => i.Client is not null))
        {
            try
            {
                await _notif.PublishAsync(
                    NotifType.RECORDATORIO_R1,
                    inv.ClientId, inv.Client!.PhoneMain,
                    new Dictionary<string, string>
                    {
                        ["nombre"]            = inv.Client.FullName,
                        ["monto"]             = inv.Amount.ToString("F2"),
                        ["periodo"]           = $"{inv.Month}/{inv.Year}",
                        ["fecha_vencimiento"] = inv.DueDate.ToString("dd/MM/yyyy"),
                        ["meses_pendientes"]  = "1",
                    });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Best-effort: fallo al encolar recordatorio de factura {InvoiceId}",
                    inv.Id);
            }
        }

        await _audit.LogAsync("Facturación", "INVOICES_MARKED_ENVIADAS",
            $"{facturas.Count} facturas {month}/{year} marcadas como Enviadas",
            userId: actorId, userName: actorName, ip: ip);

        return facturas.Count;
    }
}
