using MediatR;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Installations.Queries;
using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Tickets.Queries;

/// <summary>
/// PASO 16 Fase C: slots disponibles para agendar una visita técnica sobre un
/// ticket ya abierto. Réplica de GetInstallationSlotsHandler — mismo cálculo de
/// capacidad (ISlotCalculatorService ya suma instalaciones Y visitas de soporte
/// en la misma franja, así que no hay riesgo de doble reserva), pero la duración
/// de la visita sale de SystemConfig en vez de Plan.DuracionInstalacionMin (los
/// tickets no tienen plan) y cada slot indica si cae dentro del SLA del ticket.
/// </summary>
public record GetTicketVisitSlotsQuery(
    Guid TicketId,
    int  DiasAdelante = 5
) : IRequest<Result<List<TicketSlotDto>>>;

public class GetTicketVisitSlotsHandler
    : IRequestHandler<GetTicketVisitSlotsQuery, Result<List<TicketSlotDto>>>
{
    private const int DefaultBufferMinutes   = 20;
    private const int DefaultVisitDurationMin = 60;

    private readonly IScheduleRepository              _scheduleRepo;
    private readonly IGenericRepository<SupportTicket> _ticketRepo;
    private readonly IGenericRepository<UserSystem>  _userRepo;
    private readonly IGenericRepository<SystemConfig>  _configRepo;
    private readonly ISlotCalculatorService            _slotCalc;

    public GetTicketVisitSlotsHandler(
        IScheduleRepository               scheduleRepo,
        IGenericRepository<SupportTicket> ticketRepo,
        IGenericRepository<UserSystem>   userRepo,
        IGenericRepository<SystemConfig>  configRepo,
        ISlotCalculatorService            slotCalc)
    {
        _scheduleRepo = scheduleRepo;
        _ticketRepo   = ticketRepo;
        _userRepo     = userRepo;
        _configRepo   = configRepo;
        _slotCalc     = slotCalc;
    }

    public async Task<Result<List<TicketSlotDto>>> Handle(
        GetTicketVisitSlotsQuery req, CancellationToken ct)
    {
        var ticket = await _ticketRepo.GetByIdAsync(req.TicketId);
        if (ticket is null) return Result<List<TicketSlotDto>>.Failure("Ticket no encontrado.");
        if (ticket.Status == TicketStatus.Cerrado)
            return Result<List<TicketSlotDto>>.Failure("No se puede programar visita en un ticket cerrado.");

        var schedule = await _scheduleRepo.GetActiveAsync(ct);
        // OpenHours respeta Is24x7 — ver BusinessSchedule.
        var (startHour, endHour) = schedule?.OpenHours ?? (8, 18);
        var workingDaysMask = schedule?.WorkingDaysMask ?? WorkingDays.MondayToFriday;

        var duracionMin  = await GetVisitDurationMinutesAsync();
        var tecnicosPool = await CountTechniciansAsync(ct);
        var bufferMin    = await GetBufferMinutesAsync();

        // P1.3 (auditoría 2026-08): mismo bug ya corregido en
        // GetInstallationSlotsQuery — "hoy" y el corte de horario comercial se
        // calculaban en UTC contra un horario comercial en hora LOCAL de
        // Bolivia, y el corte de las endHour solo descartaba el día completo,
        // nunca los slots de hoy que ya pasaron.
        var ahoraLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, NotifShared.BoliviaZone);
        var hoy   = ahoraLocal.Date;
        var hasta = hoy.AddDays(req.DiasAdelante);
        var slots = new List<TicketSlotDto>();

        for (var dia = hoy; dia <= hasta; dia = dia.AddDays(1))
        {
            if (dia == hoy && ahoraLocal.Hour >= endHour) continue;

            var diaActivo = schedule is not null
                ? schedule.IsWorkingDay(dia.DayOfWeek)
                : WorkingDays.Includes(workingDaysMask, dia.DayOfWeek);

            if (!diaActivo) continue;

            var fecha = DateOnly.FromDateTime(dia);

            if (schedule?.Holidays.Any(h => h.Date == fecha) == true) continue;

            foreach (var (inicio, fin) in SlotTimeGenerator.Generate(startHour, endHour, duracionMin, bufferMin))
            {
                // Slot de HOY que ya empezó (o está por empezar ahora mismo) → no se ofrece.
                if (dia == hoy && inicio <= TimeOnly.FromDateTime(ahoraLocal)) continue;

                var comprometidos = await _slotCalc.GetCommittedCapacityAsync(fecha, inicio, fin, ct: ct);
                var disponibles   = tecnicosPool - comprometidos;
                var inicioUtc     = dia.Add(inicio.ToTimeSpan());

                slots.Add(new TicketSlotDto(
                    Fecha:       dia.ToString("yyyy-MM-dd"),
                    HoraInicio:  inicio.ToString("HH:mm"),
                    HoraFin:     fin.ToString("HH:mm"),
                    Disponibles: Math.Max(0, disponibles),
                    Disponible:  disponibles >= 1,
                    WithinSla:   !ticket.SlaDeadline.HasValue || inicioUtc <= ticket.SlaDeadline.Value
                ));
            }
        }

        return Result<List<TicketSlotDto>>.Success(slots);
    }

    private async Task<int> GetVisitDurationMinutesAsync()
    {
        var cfg = await _configRepo.FirstOrDefaultAsync(
            c => c.Key == SystemConfigKeys.TicketVisitDurationMinutes);
        return int.TryParse(cfg?.Value, out var m) && m > 0 ? m : DefaultVisitDurationMin;
    }

    private async Task<int> GetBufferMinutesAsync()
    {
        var cfg = await _configRepo.FirstOrDefaultAsync(
            c => c.Key == SystemConfigKeys.InstallationSlotBufferMinutes);
        return int.TryParse(cfg?.Value, out var m) && m >= 0 ? m : DefaultBufferMinutes;
    }

    private async Task<int> CountTechniciansAsync(CancellationToken ct)
    {
        var count = await _userRepo.CountAsync(u =>
            u.Role == UserRole.Tecnico && u.Status == UserStatus.Activo);
        return Math.Max(count, 1);
    }
}
