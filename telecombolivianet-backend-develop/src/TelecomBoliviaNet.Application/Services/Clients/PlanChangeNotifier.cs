using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Plans;

namespace TelecomBoliviaNet.Application.Services.Clients;

/// <summary>
/// Avisos al cliente sobre su solicitud de cambio de plan.
///
/// <para>Extraído de <c>PlanChangeService</c> (F5) por dos razones. La primera es
/// que agrupa las tres dependencias de mensajería —el bot, el outbox y el log—
/// que ninguna de las operaciones de negocio necesita conocer.</para>
///
/// <para>La segunda importa más: aquí vive el único <c>catch (Exception)</c> del
/// módulo que <b>traga</b> el error en vez de relanzarlo, y ahora se ve por qué.
/// Estos avisos salen DESPUÉS de confirmar la transacción; que WhatsApp esté
/// caído no puede deshacer un cambio de plan ya aprobado. Los otros tres
/// <c>catch</c> del servicio hacen rollback y relanzan, que es lo correcto para
/// ellos.</para>
/// </summary>
public class PlanChangeNotifier
{
    private readonly INotifPublisher            _notif;
    private readonly IChatbotDirectNotifier     _chatbot;
    private readonly ILogger<PlanChangeNotifier> _logger;

    public PlanChangeNotifier(
        INotifPublisher             notif,
        IChatbotDirectNotifier      chatbot,
        ILogger<PlanChangeNotifier> logger)
    {
        _notif   = notif;
        _chatbot = chatbot;
        _logger  = logger;
    }

    /// <summary>
    /// Avisa de un cambio aplicado. Intenta primero por el bot —que puede
    /// contestar en la misma conversación— y cae al outbox si no lo consigue.
    /// </summary>
    public async Task NotifyApprovedAsync(Client client, Plan newPlan, bool midMonth)
    {
        try
        {
            if (midMonth && !string.IsNullOrWhiteSpace(client.PhoneMain))
            {
                var sentDirect = await _chatbot.SendPlanChangeConfirmationAsync(
                    client.PhoneMain, client.FullName, newPlan.Name);
                if (sentDirect) return;
            }

            await _notif.PublishAsync(
                NotifType.CAMBIO_PLAN, client.Id, client.PhoneMain,
                new Dictionary<string, string>
                {
                    ["nombre"]  = client.FullName,
                    ["plan"]    = newPlan.Name,
                    ["empresa"] = "TelecomBoliviaNet",
                });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Cambio de plan aprobado pero falló la notificación al cliente {ClientId}", client.Id);
        }
    }

    /// <summary>
    /// Avisa de un rechazo. Tipo propio: antes se enviaba <c>CAMBIO_PLAN</c> con
    /// el plan solicitado, así que el cliente leía "tu plan cambió a X"
    /// exactamente cuando se le acababa de denegar ese cambio.
    /// </summary>
    ///
    /// <remarks>
    /// A diferencia de <see cref="NotifyApprovedAsync"/>, este NO atrapa el
    /// error: si el aviso falla, la excepción sube. Se conserva tal cual porque
    /// es el comportamiento que había antes de partir la clase, pero la asimetría
    /// no parece deliberada — el rechazo ya está confirmado en base cuando se
    /// llega aquí, así que un fallo de WhatsApp deja al operador viendo un error
    /// por algo que sí se guardó, y de paso se salta el asiento de auditoría, que
    /// va después. Anotado como OBS-01 en BUGS_DESCUBIERTOS; cambiarlo es una
    /// decisión de negocio, no una limpieza de refactor.
    /// </remarks>
    public async Task NotifyRejectedAsync(Client client, string? newPlanName, string motivo)
    {
        await _notif.PublishAsync(
            NotifType.CAMBIO_PLAN_RECHAZADO,
            client.Id,
            client.PhoneMain,
            new Dictionary<string, string>
            {
                ["nombre"]  = client.FullName,
                ["plan"]    = newPlanName ?? "—",
                ["motivo"]  = motivo,
                ["empresa"] = "TelecomBoliviaNet",
            });
    }
}
