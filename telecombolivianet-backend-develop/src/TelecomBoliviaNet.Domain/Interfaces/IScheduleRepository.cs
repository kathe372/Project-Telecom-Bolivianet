using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Horarios laborales con sus feriados. Todo lo que devuelve trae los feriados
/// cargados: sin ellos el cálculo de SLA daría fechas que caen en día no hábil.
/// </summary>
public interface IScheduleRepository
{
    /// <summary>Horario por defecto de la empresa. Null si no hay ninguno activo.</summary>
    Task<BusinessSchedule?> GetActiveAsync(CancellationToken ct = default);

    /// <summary>
    /// Horario concreto, si sigue activo. Lo usa el plan de SLA que apunta a un
    /// horario propio en vez de al de la empresa.
    /// </summary>
    Task<BusinessSchedule?> GetActiveByIdAsync(Guid id, CancellationToken ct = default);
}

/// <summary>Planes de SLA por prioridad. Ver ADR-001.</summary>
public interface ISlaPlanRepository : IGenericRepository<SlaPlan>
{
    /// <summary>Plan activo para una prioridad. Null si esa prioridad no tiene plan.</summary>
    Task<SlaPlan?> GetActiveByPriorityAsync(string priority, CancellationToken ct = default);
}

/// <summary>Comentarios de un ticket. Ver ADR-001.</summary>
public interface ITicketCommentRepository : IGenericRepository<TicketComment>
{
    /// <summary>Comentarios del ticket en orden cronológico, con su autor.</summary>
    Task<List<TicketComment>> GetForTicketAsync(Guid ticketId, CancellationToken ct = default);
}

/// <summary>Partes de trabajo de un ticket. Ver ADR-001.</summary>
public interface ITicketWorkLogRepository : IGenericRepository<TicketWorkLog>
{
    /// <summary>Partes del ticket, del más reciente al más antiguo, con quién los registró.</summary>
    Task<List<TicketWorkLog>> GetForTicketAsync(Guid ticketId, CancellationToken ct = default);
}
