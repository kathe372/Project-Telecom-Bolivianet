using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Tickets.Services;

/// <summary>
/// Cuándo vence un ticket, según el plan de SLA de su prioridad.
/// </summary>
/// <remarks>
/// E-01 — Salió de <c>TicketHelper</c>. La regla de contar minutos hábiles ya
/// vivía en <c>Domain/Services/SlaCalculator</c>; lo que estaba mezclado con
/// otras cuatro responsabilidades era la parte que consulta el plan y el horario.
/// </remarks>
public class TicketDueDateService
{
    private readonly ISlaPlanRepository  _slaPlanRepo;
    private readonly IScheduleRepository _scheduleRepo;

    public TicketDueDateService(ISlaPlanRepository slaPlanRepo, IScheduleRepository scheduleRepo)
    {
        _slaPlanRepo  = slaPlanRepo;
        _scheduleRepo = scheduleRepo;
    }

    /// <summary>
    /// Fecha límite, o <c>null</c> si no hay plan activo para esa prioridad.
    /// </summary>
    public async Task<DateTime?> CalcularAsync(TicketPriority priority, DateTime? startTime = null)
    {
        var plan = await _slaPlanRepo.GetActiveByPriorityAsync(priority.ToString());
        if (plan is null) return null;

        var from = startTime ?? DateTime.UtcNow;

        // Plan de 24 horas: los minutos corren de corrido.
        if (plan.Schedule != SlaSchedule.Laboral)
            return from.AddMinutes(plan.ResolutionMinutes);

        var schedule = plan.BusinessScheduleId.HasValue
            ? await _scheduleRepo.GetActiveByIdAsync(plan.BusinessScheduleId.Value)
            : await _scheduleRepo.GetActiveAsync();

        // Sin horario configurado, o uno 24x7: vuelve a ser tiempo corrido.
        if (schedule is null || schedule.Is24x7)
            return from.AddMinutes(plan.ResolutionMinutes);

        var holidays = schedule.Holidays.Select(h => h.Date).ToList();
        return SlaCalculator.AddBusinessMinutes(from, plan.ResolutionMinutes, schedule, holidays);
    }
}
