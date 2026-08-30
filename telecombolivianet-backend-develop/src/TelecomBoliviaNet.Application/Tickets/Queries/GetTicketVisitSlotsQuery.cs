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
/// slots disponibles para agendar una visita técnica sobre un
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

        var duracionMin  = await GetVisitDurationMinutesAsync();
        var tecnicosPool = await CountTechniciansAsync(ct);
        var bufferMin    = await GetBufferMinutesAsync();

        // El horario de atención está en hora LOCAL de Bolivia, así que "hoy"
        // también: calculado en UTC, el día se adelantaba cuatro horas.
        var ahoraLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, NotifShared.BoliviaZone);
        var slots = new List<TicketSlotDto>();

        // D-12 — Qué días se pueden ofrecer lo decide SlotWindow, que es la
        // misma regla que usa la agenda de instalaciones. Antes estaba escrita
        // aquí y allí, idéntica, y se corrigió dos veces.
        var dias = SlotWindow.DiasOfrecibles(
            ahoraLocal, req.DiasAdelante, endHour,
            SlotWindow.LaborableSegun(schedule),
            SlotWindow.FeriadosSegun(schedule));

        foreach (var fecha in dias)
        {
            var dia = fecha.ToDateTime(TimeOnly.MinValue);

            foreach (var (inicio, fin) in SlotTimeGenerator.Generate(startHour, endHour, duracionMin, bufferMin))
            {
                // Slot de HOY que ya empezó (o está por empezar ahora mismo) → no se ofrece.
                if (SlotWindow.YaPaso(fecha, inicio, ahoraLocal)) continue;

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
