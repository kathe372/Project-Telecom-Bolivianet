using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Domain.Services;

public static class SlaCalculator
{
    /// <summary>
    /// Tope de días hábiles que puede recorrer un cálculo de SLA. Mismo criterio
    /// que las guardas de las funciones auxiliares: un año es más que suficiente
    /// para cualquier SLA real, y convierte un cuelgue en un error legible.
    /// </summary>
    private const int MaxDiasHaciaAdelante = 365;

    public static DateTime AddBusinessMinutes(
        DateTime utcStart, int minutes, BusinessSchedule schedule, IReadOnlyList<DateOnly> holidays)
    {
        var offset   = TimeSpan.FromHours(schedule.UtcOffsetHours);
        var bizStart = TimeSpan.FromHours(schedule.StartHour);
        var bizEnd   = TimeSpan.FromHours(schedule.EndHour);

        var local = utcStart + offset;
        local = SnapToNextBusinessMoment(local, schedule, holidays, bizStart, bizEnd);

        // D-16: el bucle lleva guarda, igual que SnapToNextBusinessMoment y
        // NextBusinessDayStart. Sin ella, un horario con EndHour <= StartHour hace
        // que minutesToEndOfDay no sea positivo, `minutes` no baje nunca y el hilo
        // del job de SLA gire para siempre. Hoy ValidateDto lo impide y
        // TicketHelper desvía el caso 24x7 antes de llamar aquí, pero esa
        // protección vive en otros dos archivos: el cálculo debe defenderse solo.
        for (var guard = 0; minutes > 0; guard++)
        {
            var minutesToEndOfDay = (int)((local.Date + bizEnd) - local).TotalMinutes;

            if (minutesToEndOfDay <= 0)
                throw new ArgumentException(
                    $"El horario comercial '{schedule.Name}' no tiene jornada útil " +
                    $"(inicio {schedule.StartHour}:00, fin {schedule.EndHour}:00). " +
                    "No se puede calcular un vencimiento de SLA sobre él.",
                    nameof(schedule));

            if (guard >= MaxDiasHaciaAdelante)
                throw new ArgumentException(
                    $"El SLA de {minutes} minuto(s) restantes no cabe en " +
                    $"{MaxDiasHaciaAdelante} días hábiles del horario '{schedule.Name}'.",
                    nameof(minutes));

            if (minutes <= minutesToEndOfDay)
            {
                local = local.AddMinutes(minutes);
                break;
            }
            minutes -= minutesToEndOfDay;
            local    = NextBusinessDayStart(local.Date.AddDays(1), schedule, holidays, bizStart);
        }
        return local - offset;
    }

    private static DateTime SnapToNextBusinessMoment(
        DateTime local, BusinessSchedule schedule, IReadOnlyList<DateOnly> holidays,
        TimeSpan bizStart, TimeSpan bizEnd)
    {
        for (var guard = 0; guard < 365; guard++)
        {
            var today = DateOnly.FromDateTime(local);
            if (!schedule.IsWorkingDay(local.DayOfWeek) || holidays.Contains(today))
            {
                local = local.Date.AddDays(1) + bizStart;
                continue;
            }
            if (local.TimeOfDay < bizStart) return local.Date + bizStart;
            if (local.TimeOfDay >= bizEnd)
                return NextBusinessDayStart(local.Date.AddDays(1), schedule, holidays, bizStart);
            return local;
        }
        return local;
    }

    private static DateTime NextBusinessDayStart(
        DateTime date, BusinessSchedule schedule, IReadOnlyList<DateOnly> holidays, TimeSpan bizStart)
    {
        var d = date.Date + bizStart;
        for (var guard = 0; guard < 365; guard++)
        {
            var today = DateOnly.FromDateTime(d);
            if (schedule.IsWorkingDay(d.DayOfWeek) && !holidays.Contains(today))
                return d;
            d = d.AddDays(1);
        }
        return d;
    }
}
