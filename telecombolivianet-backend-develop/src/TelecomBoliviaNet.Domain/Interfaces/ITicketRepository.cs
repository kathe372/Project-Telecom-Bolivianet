using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Consultas de tickets expresadas en lenguaje de negocio. Ver ADR-001.
/// Crece por demanda.
/// </summary>
public interface ITicketRepository : IGenericRepository<SupportTicket>
{
    /// <summary>
    /// A quién está asignado un ticket, sin traer la fila entera.
    ///
    /// Lo usa el chatbot para decidir si escala a un humano, así que se llama a
    /// menudo y con un solo dato basta.
    /// </summary>
    Task<Guid?> GetAssignedUserIdAsync(Guid ticketId, CancellationToken ct = default);
}

/// <summary>
/// Lecturas del registro de auditoría que necesitan las pantallas de detalle.
/// Escribir asientos es cosa de <c>AuditService</c>.
/// </summary>
public interface IAuditLogRepository : IGenericRepository<AuditLog>
{
    /// <summary>
    /// Últimos movimientos registrados sobre una entidad de un módulo, del más
    /// reciente al más antiguo. El orden y el tope se resuelven en SQL.
    /// </summary>
    Task<List<AuditLog>> GetRecentByEntityAsync(
        Guid entityId, string module, int take, CancellationToken ct = default);
}
