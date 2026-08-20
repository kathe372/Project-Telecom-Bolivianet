using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Services;

public class SlotCalculatorService : ISlotCalculatorService
{
    private readonly AppDbContext _db;

    public SlotCalculatorService(AppDbContext db) => _db = db;

    public async Task<int> GetCommittedCapacityAsync(
        DateOnly fecha, TimeOnly horaInicio, TimeOnly horaFin,
        Guid? excludeInstallationId = null,
        CancellationToken ct = default)
    {
        var fechaDt   = fecha.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var slotStart = fechaDt.Add(horaInicio.ToTimeSpan());
        var slotEnd   = fechaDt.Add(horaFin.ToTimeSpan());

        // Instalaciones activas del día (Reprogramada se incluye de forma
        // defensiva por si quedan filas sin normalizar de versiones previas).
        // Solapamiento por rango horario, no igualdad exacta: el conteo sigue
        // siendo correcto aunque la grilla de slots cambie (p.ej. buffer).
        var instalacionesDia = await _db.Set<Installation>()
            .Where(i =>
                i.Fecha.Date == fechaDt.Date &&
                (excludeInstallationId == null || i.Id != excludeInstallationId) &&
                (i.Status == InstallationStatus.Pendiente ||
                 i.Status == InstallationStatus.EnProceso ||
                 i.Status == InstallationStatus.Reprogramada))
            .Select(i => new
            {
                i.HoraInicio,
                i.DuracionMin,
                Asignados  = i.Technicians.Count,
                Requeridos = i.Plan!.TecnicosRequeridos,
            })
            .ToListAsync(ct);

        // Cada instalación solapada compromete max(asignados, requeridos, 1)
        // técnicos: una instalación del bot sin técnico asignado también
        // reserva capacidad desde el momento en que se agenda.
        var capacidadInstalaciones = instalacionesDia
            .Where(x => x.HoraInicio < horaFin &&
                        x.HoraInicio.AddMinutes(x.DuracionMin) > horaInicio)
            .Sum(x => Math.Max(Math.Max(x.Asignados, x.Requeridos), 1));

        var tecnicosEnVisitas = await _db.VisitTechnicians
            .Where(vt =>
                vt.Visit!.ScheduledAt >= slotStart &&
                vt.Visit!.ScheduledAt < slotEnd &&
                vt.Visit!.Status == VisitStatus.Programada)
            .Select(vt => vt.TechnicianId)
            .Distinct()
            .CountAsync(ct);

        return capacidadInstalaciones + tecnicosEnVisitas;
    }
}
