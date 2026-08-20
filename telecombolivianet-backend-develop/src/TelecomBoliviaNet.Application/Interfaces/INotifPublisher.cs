using TelecomBoliviaNet.Domain.Entities.Notifications;

namespace TelecomBoliviaNet.Application.Interfaces;

public interface INotifPublisher
{
    Task PublishAsync(
        NotifType tipo,
        Guid      clienteId,
        string?   phoneNumber,
        Dictionary<string, string> contexto,
        Guid?     referenciaId = null);
}
