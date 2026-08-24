using TelecomBoliviaNet.Domain.Entities.Notifications;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Lecturas del registro de notificaciones enviadas. Ver ADR-001.
/// El encolado y el reintento son cosa del outbox, no de aquí.
/// </summary>
public interface INotifLogRepository : IGenericRepository<NotifLog>
{
    /// <summary>
    /// Notificaciones registradas a un cliente dentro de una ventana de fechas.
    /// Alimenta la línea de tiempo de su ficha.
    /// </summary>
    Task<List<NotifLog>> GetForClientBetweenAsync(
        Guid clientId, DateTime? from, DateTime? to, CancellationToken ct = default);
}
