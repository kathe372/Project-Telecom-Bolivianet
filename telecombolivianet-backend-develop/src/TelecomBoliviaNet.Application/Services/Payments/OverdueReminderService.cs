using System.Text.Json;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Payments;

/// <summary>
/// Recordatorio masivo a los clientes con facturas vencidas, extraído de
/// <c>PaymentService</c> (F5). No registra ni consulta cobros: encola avisos.
/// </summary>
public class OverdueReminderService : IOverdueReminderService
{
    private readonly IClientRepository                _clientRepo;
    private readonly INotifPublisher                  _notif;
    private readonly AuditService                     _audit;
    private readonly ILogger<OverdueReminderService>  _logger;

    public OverdueReminderService(
        IClientRepository               clientRepo,
        INotifPublisher                 notif,
        AuditService                    audit,
        ILogger<OverdueReminderService> logger)
    {
        _clientRepo = clientRepo;
        _notif      = notif;
        _audit      = audit;
        _logger     = logger;
    }

    public async Task<ReminderJobResultDto> SendOverdueRemindersAsync(
        Guid? actorId = null, string actorName = "Sistema")
    {
        var overdueClients = await _clientRepo.GetWithOverdueInvoicesAsync();

        int sent = 0, skipped = 0, errors = 0;

        foreach (var client in overdueClients)
        {
            try
            {
                var vencidas = client.Invoices.Where(i => i.Status == InvoiceStatus.Vencida).ToList();

                // Saldo remanente, no el monto bruto: quien abonó parte de una factura
                // vencida recibía un recordatorio reclamándole el importe completo.
                var deuda = vencidas.Sum(i => i.Outstanding);
                var meses = vencidas.Count;

                await _notif.PublishAsync(
                    NotifType.FACTURA_VENCIDA,
                    client.Id,
                    client.PhoneMain,
                    new Dictionary<string, string>
                    {
                        ["nombre"]  = client.FullName,
                        ["monto"]   = $"{deuda:F2}",
                        ["periodo"] = $"{meses} mes(es) vencido(s)",
                    },
                    referenciaId: vencidas.First().Id
                );
                sent++;
            }
            catch (Exception ex)
            {
                // Un cliente que falle no debe dejar sin aviso a los demás.
                _logger.LogWarning(ex,
                    "Error al encolar recordatorio de vencimiento para cliente {ClientId}",
                    client.Id);
                errors++;
            }
        }

        await _audit.LogAsync(
            "Pagos", "REMINDER_JOB_EXECUTED",
            $"Recordatorios encolados en outbox: {sent} clientes, {errors} errores",
            userId: actorId, userName: actorName,
            newData: JsonSerializer.Serialize(new { Enqueued = sent, Errors = errors }));

        return new ReminderJobResultDto(sent, skipped, errors,
            DateTime.UtcNow.ToString("dd/MM/yyyy HH:mm"));
    }
}
