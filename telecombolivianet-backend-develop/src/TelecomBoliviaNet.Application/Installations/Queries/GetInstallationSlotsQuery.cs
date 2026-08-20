using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Installations.Queries;

public record GetInstallationSlotsQuery(
    int   DiasAdelante = 7,
    Guid? PlanId       = null
) : IRequest<List<SlotDisponibleDto>>;

public class GetInstallationSlotsHandler
    : IRequestHandler<GetInstallationSlotsQuery, List<SlotDisponibleDto>>
{
    private const int DefaultBufferMinutes = 20;

    private readonly IScheduleRepository             _scheduleRepo;
    private readonly IGenericRepository<Plan>        _planRepo;
    private readonly IGenericRepository<UserSystem>  _userRepo;
    private readonly IGenericRepository<SystemConfig> _configRepo;
    private readonly ISlotCalculatorService          _slotCalc;

    public GetInstallationSlotsHandler(
        IScheduleRepository            scheduleRepo,
        IGenericRepository<Plan>       planRepo,
        IGenericRepository<UserSystem> userRepo,
        IGenericRepository<SystemConfig> configRepo,
        ISlotCalculatorService         slotCalc)
    {
        _scheduleRepo = scheduleRepo;
        _planRepo     = planRepo;
        _userRepo     = userRepo;
        _configRepo   = configRepo;
        _slotCalc     = slotCalc;
    }

    public async Task<List<SlotDisponibleDto>> Handle(
        GetInstallationSlotsQuery req, CancellationToken ct)
    {
        var schedule = await _scheduleRepo.GetActiveAsync(ct);
        var startHour        = schedule?.StartHour        ?? 8;
        var endHour          = schedule?.EndHour          ?? 18;
        var workingDaysMask  = schedule?.WorkingDaysMask  ?? 31;

        var plan = req.PlanId.HasValue
            ? await _planRepo.GetByIdAsync(req.PlanId.Value)
            : null;

        var tecnicosRequeridos   = plan?.TecnicosRequeridos    ?? 1;
        var duracionMin          = plan?.DuracionInstalacionMin ?? 120;
        var tecnicosPool         = await CountTechniciansAsync(ct);
        var bufferMin            = await GetBufferMinutesAsync();

        // BUG reportado: "hoy" y la hora de corte se calculaban en UTC
        // (DateTime.UtcNow), pero el horario comercial (startHour/endHour) es
        // hora LOCAL de Bolivia (UTC-4) — con eso solo, "hoy" podía ni
        // siquiera calcular bien el día. Y aunque el día quedara bien, el
        // corte de las 18:00 (endHour) solo descartaba el día COMPLETO una
        // vez pasada esa hora: nunca se filtraban los slots de HOY que ya
        // pasaron (ej. ofrecer 08:00 estando ya en las 09:41).
        var ahoraLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, NotifShared.BoliviaZone);
        var hoy   = ahoraLocal.Date;
        var hasta = hoy.AddDays(req.DiasAdelante);
        var slots = new List<SlotDisponibleDto>();

        for (var dia = hoy; dia <= hasta; dia = dia.AddDays(1))
        {
            if (dia == hoy && ahoraLocal.Hour >= endHour) continue;

            var diaActivo = schedule is not null
                ? schedule.IsWorkingDay(dia.DayOfWeek)
                : IsDefaultWorkingDay(dia.DayOfWeek, workingDaysMask);

            if (!diaActivo) continue;

            var fecha = DateOnly.FromDateTime(dia);

            if (schedule?.Holidays.Any(h => h.Date == fecha) == true) continue;

            foreach (var (inicio, fin) in SlotTimeGenerator.Generate(startHour, endHour, duracionMin, bufferMin))
            {
                // Slot de HOY que ya empezó (o está por empezar ahora mismo) → no se ofrece.
                if (dia == hoy && inicio <= TimeOnly.FromDateTime(ahoraLocal)) continue;

                var comprometidos = await _slotCalc.GetCommittedCapacityAsync(fecha, inicio, fin, ct: ct);
                var disponibles   = tecnicosPool - comprometidos;

                slots.Add(new SlotDisponibleDto(
                    Fecha:      dia.ToString("yyyy-MM-dd"),
                    HoraInicio: inicio.ToString("HH:mm"),
                    HoraFin:    fin.ToString("HH:mm"),
                    Disponibles: Math.Max(0, disponibles),
                    Disponible:  disponibles >= tecnicosRequeridos
                ));
            }
        }

        return slots;
    }

    private async Task<int> GetBufferMinutesAsync()
    {
        var cfg = await _configRepo.FirstOrDefaultAsync(
            c => c.Key == SystemConfigKeys.InstallationSlotBufferMinutes);
        return int.TryParse(cfg?.Value, out var m) && m >= 0 ? m : DefaultBufferMinutes;
    }

    private async Task<int> CountTechniciansAsync(CancellationToken ct)
    {
        var count = await _userRepo.GetAll()
            .CountAsync(u => u.Role == UserRole.Tecnico && u.Status == UserStatus.Activo, ct);
        return Math.Max(count, 1);
    }

    private static bool IsDefaultWorkingDay(DayOfWeek day, int mask) =>
        day switch
        {
            DayOfWeek.Monday    => (mask & 1)  != 0,
            DayOfWeek.Tuesday   => (mask & 2)  != 0,
            DayOfWeek.Wednesday => (mask & 4)  != 0,
            DayOfWeek.Thursday  => (mask & 8)  != 0,
            DayOfWeek.Friday    => (mask & 16) != 0,
            DayOfWeek.Saturday  => (mask & 32) != 0,
            DayOfWeek.Sunday    => (mask & 64) != 0,
            _                   => false
        };
}
