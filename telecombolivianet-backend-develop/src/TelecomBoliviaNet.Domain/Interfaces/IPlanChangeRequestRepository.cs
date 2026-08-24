using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Consultas de las solicitudes de cambio de plan. Ver ADR-001.
/// </summary>
public interface IPlanChangeRequestRepository : IGenericRepository<PlanChangeRequest>
{
    /// <summary>
    /// Solicitud con todo lo que necesitan aprobarla o rechazarla: el cliente
    /// con su plan actual y los dos planes de la solicitud.
    ///
    /// <para>Es UN método y no dos (aprobar carga el plan del cliente, rechazar
    /// no) por la misma razón que <see cref="IInstallationRepository.GetForCommandAsync"/>:
    /// se busca una sola fila por clave primaria, y traer una referencia de más
    /// no se nota.</para>
    /// </summary>
    Task<PlanChangeRequest?> GetForCommandAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Solicitudes pendientes de resolver —de la más antigua a la más reciente,
    /// que es el orden en que se atienden—, opcionalmente las de un solo cliente.
    /// </summary>
    Task<List<PlanChangeRequest>> GetPendingAsync(
        Guid? clientId = null, CancellationToken ct = default);

    /// <summary>Historial de cambios de plan de un cliente, del más reciente al más antiguo.</summary>
    Task<List<PlanChangeRequest>> GetHistoryForClientAsync(
        Guid clientId, CancellationToken ct = default);

    /// <summary>
    /// Cambios de plan de un cliente ocurridos dentro de una ventana de fechas,
    /// con ambos planes cargados. Alimenta la línea de tiempo de su ficha.
    /// </summary>
    Task<List<PlanChangeRequest>> GetForClientBetweenAsync(
        Guid clientId, DateTime? from, DateTime? to, CancellationToken ct = default);
}
