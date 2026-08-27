using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Horarios laborales con sus feriados. Todo lo que devuelve trae los feriados
/// cargados: sin ellos el cálculo de SLA daría fechas que caen en día no hábil.
/// </summary>
public interface IScheduleRepository : IGenericRepository<BusinessSchedule>
{
    /// <summary>Horario por defecto de la empresa. Null si no hay ninguno activo.</summary>
    Task<BusinessSchedule?> GetActiveAsync(CancellationToken ct = default);

    /// <summary>
    /// Horario concreto, si sigue activo. Lo usa el plan de SLA que apunta a un
    /// horario propio en vez de al de la empresa.
    /// </summary>
    Task<BusinessSchedule?> GetActiveByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Todos los horarios, el de por defecto primero y el resto por nombre —
    /// que es el orden en que los muestra la pantalla de configuración.
    /// </summary>
    Task<List<BusinessSchedule>> GetAllWithHolidaysAsync(CancellationToken ct = default);

    /// <summary>Horario concreto, activo o no. Lo pide la pantalla de edición.</summary>
    Task<BusinessSchedule?> GetWithHolidaysAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Horarios marcados como el de por defecto. Debería haber uno, y esta
    /// consulta existe justamente para dejar de serlo al nombrar otro.
    /// </summary>
    Task<List<BusinessSchedule>> GetDefaultsAsync(CancellationToken ct = default);
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

/// <summary>Adjuntos de un ticket (fotos del técnico, comprobantes). Ver ADR-001.</summary>
public interface ITicketAttachmentRepository : IGenericRepository<TicketAttachment>
{
    /// <summary>
    /// Adjuntos vigentes del ticket, del más reciente al más antiguo y con
    /// quién los subió.
    /// </summary>
    Task<List<TicketAttachment>> GetActiveByTicketAsync(
        Guid ticketId, CancellationToken ct = default);

    /// <summary>Cuántos adjuntos vigentes tiene, para el tope por ticket.</summary>
    Task<int> CountActiveByTicketAsync(Guid ticketId, CancellationToken ct = default);
}
