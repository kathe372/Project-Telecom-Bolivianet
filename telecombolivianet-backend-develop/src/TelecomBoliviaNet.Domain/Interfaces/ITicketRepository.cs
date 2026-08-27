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

    /// <summary>
    /// Ticket con cliente, técnico y autor, para mostrarlo o notificarlo.
    /// </summary>
    Task<SupportTicket?> GetSummaryAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Ficha del ticket: además de lo anterior, el plan del cliente. Se salta el
    /// filtro de borrado del cliente — un ticket histórico no debe perder el
    /// nombre de su cliente porque a este se le dio de baja.
    /// </summary>
    Task<SupportTicket?> GetDetailAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Página del listado, filtrada y ordenada como la ve el operador: primero
    /// lo que sigue abierto, dentro de eso por prioridad y luego por antigüedad.
    /// </summary>
    Task<(List<SupportTicket> Items, int Total)> GetPagedAsync(
        TicketListFilter filter, CancellationToken ct = default);

    /// <summary>
    /// Todos los tickets de un cliente, del más reciente al más antiguo.
    /// </summary>
    Task<List<SupportTicket>> GetForClientAsync(Guid clientId, CancellationToken ct = default);

    /// <summary>
    /// Tickets abiertos cuyo plazo de SLA ya venció, del más atrasado al menos.
    /// Los rangos de fecha y el técnico son opcionales, para el informe.
    /// </summary>
    Task<List<SupportTicket>> GetOverdueSlaAsync(
        DateTime          now,
        DateTime?         from           = null,
        DateTime?         to             = null,
        string?           technicianName = null,
        CancellationToken ct             = default);

    /// <summary>
    /// Tickets abiertos con plazo de SLA, reducidos a lo que el semáforo pinta.
    /// El porcentaje consumido se calcula fuera: depende de "ahora", y esa
    /// decisión no le toca al repositorio.
    /// </summary>
    Task<List<SlaTrackedTicket>> GetSlaTrackedAsync(CancellationToken ct = default);

    /// <summary>Ticket con su cliente, para los comandos que le notifican algo.</summary>
    Task<SupportTicket?> GetWithClientAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Cuántos tickets vivos tiene encima cada técnico, y cuántos de ellos son
    /// críticos. El conteo lo hace SQL: traer todos los tickets abiertos a
    /// memoria para agruparlos sería absurdo.
    ///
    /// <para>Solo aparecen los técnicos que tienen alguno; quien reparte carga
    /// completa con cero los que faltan, porque solo él sabe qué lista de
    /// técnicos le interesa.</para>
    /// </summary>
    Task<Dictionary<Guid, TechnicianLoad>> GetOpenLoadByTechnicianAsync(
        IReadOnlyCollection<Guid> technicianIds, CancellationToken ct = default);

    /// <summary>
    /// Cuándo se le asignó por última vez un ticket a cada técnico. Desempata
    /// entre técnicos con la misma carga, para que el reparto rote.
    /// </summary>
    Task<Dictionary<Guid, DateTime>> GetLastAssignmentByTechnicianAsync(
        IReadOnlyCollection<Guid> technicianIds, CancellationToken ct = default);
}

/// <summary>Tickets vivos de un técnico: el total y cuántos son críticos.</summary>
public record TechnicianLoad(int Total, int Critical);

/// <summary>
/// Criterios del listado de tickets. Todo opcional: la pantalla arranca sin
/// filtros y el operador va acotando.
/// </summary>
public record TicketListFilter(
    string?   Search           = null,
    string?   Status           = null,
    string?   Priority         = null,
    string?   Type             = null,
    Guid?     AssignedToId     = null,
    DateTime? OverdueSlaBefore = null,
    DateTime? DateFrom         = null,
    DateTime? DateTo           = null,
    bool?     SlaCompliant     = null,
    int       Page             = 1,
    int       PageSize         = 20);

/// <summary>Lo mínimo que necesita el semáforo de SLA de un ticket abierto.</summary>
public record SlaTrackedTicket(
    Guid           Id,
    string?        TicketNumber,
    string         Subject,
    TicketPriority Priority,
    TicketStatus   Status,
    string         ClientName,
    string?        AssignedToName,
    DateTime       CreatedAt,
    DateTime       DueDate);

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
