using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Consultas de visitas técnicas. Ver ADR-001.
///
/// Las dos que hay comparten el mismo Include —ticket con su cliente y el plan de
/// ese cliente—, porque la agenda muestra a quién se visita y con qué servicio.
/// </summary>
public interface ITicketVisitRepository : IGenericRepository<TicketVisit>
{
    /// <summary>
    /// Visitas de un técnico en un día, sea como titular o como parte del equipo.
    /// Las canceladas no salen en la agenda.
    /// </summary>
    Task<List<TicketVisit>> GetTechnicianDayAsync(
        Guid tecnicoId, DateTime fecha, CancellationToken ct = default);

    /// <summary>
    /// Visitas PROGRAMADAS de un rango, para el calendario. Solo de tickets vivos:
    /// una visita de un ticket ya cerrado no debe ocupar hueco en la agenda.
    /// </summary>
    Task<List<TicketVisit>> GetCalendarRangeAsync(
        DateTime desde, DateTime hasta, Guid? tecnicoId, CancellationToken ct = default);

    /// <summary>
    /// Visitas de un ticket en orden cronológico, con el técnico asignado —
    /// incluidas las canceladas: la ficha cuenta el historial completo.
    /// </summary>
    Task<List<TicketVisit>> GetForTicketAsync(Guid ticketId, CancellationToken ct = default);
}
