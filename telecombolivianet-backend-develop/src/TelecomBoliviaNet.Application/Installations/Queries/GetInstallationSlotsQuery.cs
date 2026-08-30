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
        // OpenHours respeta Is24x7: un horario 24x7 cubre el día entero aunque
        // StartHour/EndHour valgan cualquier cosa, que es lo que pasa cuando se
        // creó marcando 24x7 (el validador no los comprueba en ese caso).
        var (startHour, endHour) = schedule?.OpenHours ?? (8, 18);

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
        var slots = new List<SlotDisponibleDto>();

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
        var count = await _userRepo.CountAsync(
            u => u.Role == UserRole.Tecnico && u.Status == UserStatus.Activo);
        return Math.Max(count, 1);
    }
}
