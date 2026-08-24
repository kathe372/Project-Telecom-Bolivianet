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

    /// <summary>
    /// Ticket por Id <b>aunque su cliente esté dado de baja</b>.
    ///
    /// La entidad filtra por el borrado lógico del cliente, así que los flujos
    /// que cierran pendientes de un cliente ya dado de baja —resolver su cambio
    /// de plan, por ejemplo— necesitan saltarse ese filtro.
    /// </summary>
    Task<SupportTicket?> GetByIdIgnoringClientFilterAsync(
        Guid id, CancellationToken ct = default);

    /// <summary>
    /// Tickets de un cliente creados dentro de una ventana de fechas, con quién
    /// los abrió. Alimenta la línea de tiempo de su ficha.
    /// </summary>
    Task<List<SupportTicket>> GetForClientBetweenAsync(
        Guid clientId, DateTime? from, DateTime? to, CancellationToken ct = default);
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

    /// <summary>
    /// Asientos sobre una entidad dentro de una ventana de fechas, sin tope ni
    /// filtro de módulo. Alimenta la línea de tiempo de la ficha del cliente.
    /// </summary>
    Task<List<AuditLog>> GetForEntityBetweenAsync(
        Guid entityId, DateTime? from, DateTime? to, CancellationToken ct = default);
}
