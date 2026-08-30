using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Application.Tickets.Mapping;

/// <summary>
/// Entidad de ticket → DTO. Estático y sin dependencias.
/// </summary>
/// <remarks>
/// E-01 — Salió de <c>TicketHelper</c>, que hacía cinco cosas sin relación entre
/// sí: acceso a datos, composición de DTO, cálculo de SLA, notificación y este
/// mapeo. Sus 9 dependencias eran la suma de cinco trabajos, no el coste de uno.
///
/// <para>Aquí no hace falta ninguna: mapear no consulta nada. Sigue la convención
/// de <c>*Mapper</c> estático que el proyecto ya usa en Clientes, Pagos y Facturas.</para>
/// </remarks>
public static class TicketMapper
{
    public static TicketListItemDto ToListItem(SupportTicket t)
    {
        // Próxima visita programada (no cancelada), la más próxima en el tiempo.
        // Requiere que el caller haya hecho Include(t => t.Visits).ThenInclude(v => v.Technician);
        // si no se incluyó, t.Visits queda vacío y esto simplemente no rompe nada.
        var nextVisit = t.Visits?
            .Where(v => v.Status == VisitStatus.Programada)
            .OrderBy(v => v.ScheduledAt)
            .FirstOrDefault();

        return new(
            t.Id, t.Client?.FullName ?? t.ProspectName ?? "", t.Client?.TbnCode ?? "", t.ClientId,
            t.Subject, t.Type.ToString(), t.Priority.ToString(), t.Status.ToString(), t.Origin.ToString(),
            t.Description, t.SupportGroup, t.AssignedTo?.FullName, t.AssignedToUserId,
            t.CreatedBy?.FullName ?? "", t.CreatedAt, t.DueDate, t.ResolvedAt,
            t.FirstRespondedAt, t.SlaCompliant, t.WorkLogs?.Sum(w => w.Minutes) ?? 0,
            t.TicketNumber, t.SlaDeadline, t.AutoAssigned,
            NextVisitAt:             nextVisit?.ScheduledAt,
            NextVisitTechnicianName: nextVisit?.Technician?.FullName);
    }

    public static SlaPlanDto ToSlaPlan(SlaPlan p) =>
        new(p.Id, p.Name, p.Priority, p.FirstResponseMinutes, p.ResolutionMinutes,
            p.Schedule.ToString(), p.IsActive);
}
