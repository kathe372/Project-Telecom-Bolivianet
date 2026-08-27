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
/// <para>La segunda importa más: los dos avisos tienen garantías DISTINTAS a
/// propósito, y aquí se ve por qué.</para>
///
/// <para><see cref="NotifyRejectedAsync"/> solo escribe en el outbox, así que
/// quien llama lo mete en su transacción y deja subir cualquier fallo: el
/// rechazo y el aviso se confirman juntos o no se confirma ninguno.</para>
///
/// <para><see cref="NotifyApprovedAsync"/> intenta primero una llamada HTTP al
/// bot, que no puede vivir dentro de una transacción, así que sale después del
/// commit y traga el error: que el bot esté caído no puede deshacer un cambio de
/// plan ya aprobado. El precio es que ese aviso sí se puede perder — para
/// cerrarlo habría que partir este método en dos, outbox dentro y HTTP fuera
/// (OBS-01, pendiente).</para>
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
    /// error, y es deliberado: <c>PublishAsync</c> no llama a WhatsApp, inserta
    /// una fila en <c>NotifOutbox</c>, y quien llama lo hace <b>dentro de su
    /// transacción</b>. Dejar subir la excepción es lo que permite que el
    /// rechazo y el aviso se confirmen juntos o no se confirme ninguno.
    ///
    /// <para>Atraparlo aquí rompería esa garantía: el rechazo quedaría guardado
    /// y el mensaje perdido sin reintento posible, porque el worker solo entrega
    /// lo que llegó a escribirse. Ver OBS-01 en BUGS_DESCUBIERTOS.</para>
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
