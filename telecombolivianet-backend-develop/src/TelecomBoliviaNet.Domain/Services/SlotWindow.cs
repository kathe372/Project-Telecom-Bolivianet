using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Qué días y qué franjas se pueden ofrecer a partir de un instante dado.
/// </summary>
/// <remarks>
/// D-12 — Esta decisión estaba escrita dos veces, línea por línea idéntica, en
/// <c>GetInstallationSlotsQuery</c> y <c>GetTicketVisitSlotsQuery</c>. El
/// comentario de la segunda lo dice sin rodeos: "mismo bug ya corregido en
/// GetInstallationSlotsQuery". Se corrigió dos veces porque estaba dos veces.
///
/// <para>Y estaba dentro de handlers que leen el reloj, así que sus casos de
/// borde —un viernes por la tarde, un feriado, el corte de las 18:00— no se
/// podían probar: se esquivaban ampliando la ventana de los tests a siete días
/// para que el fin de semana no la vaciara. Aquí "ahora" es un parámetro, así
/// que esos casos se prueban de frente.</para>
/// </remarks>
public static class SlotWindow
{
    /// <summary>
    /// Los días ofrecibles entre hoy y <paramref name="diasAdelante"/>, en hora
    /// LOCAL. El horario de atención está en hora local, así que "hoy" también
    /// tiene que estarlo: calcularlo en UTC adelantaba el día cuatro horas.
    /// </summary>
    /// <param name="ahoraLocal">Momento actual, ya convertido a hora de Bolivia.</param>
    /// <param name="endHour">Hora de cierre. Pasada, hoy ya no se ofrece.</param>
    public static IEnumerable<DateOnly> DiasOfrecibles(
        DateTime               ahoraLocal,
        int                    diasAdelante,
        int                    endHour,
        Func<DayOfWeek, bool>  esDiaLaborable,
        Func<DateOnly, bool>   esFeriado)
    {
        var hoy = DateOnly.FromDateTime(ahoraLocal);

        for (var i = 0; i <= diasAdelante; i++)
        {
            var dia = hoy.AddDays(i);

            // Hoy, pasada la hora de cierre, ya no queda nada que ofrecer. El
            // corte descartaba el día entero pero no las franjas de hoy que ya
            // habían pasado: para eso está YaPaso.
            if (dia == hoy && ahoraLocal.Hour >= endHour) continue;

            if (!esDiaLaborable(dia.DayOfWeek)) continue;
            if (esFeriado(dia))                 continue;

            yield return dia;
        }
    }

    /// <summary>
    /// Si una franja de HOY ya empezó no se ofrece. Las de días siguientes,
    /// siempre. El límite es estricto: una franja que empieza justo ahora ya no
    /// da tiempo a nadie a llegar.
    /// </summary>
    public static bool YaPaso(DateOnly dia, TimeOnly inicio, DateTime ahoraLocal)
        => dia == DateOnly.FromDateTime(ahoraLocal)
        && inicio <= TimeOnly.FromDateTime(ahoraLocal);

    /// <summary>
    /// El criterio de día laborable de un horario concreto, o el de respaldo
    /// —lunes a viernes— si no hay ninguno configurado.
    /// </summary>
    public static Func<DayOfWeek, bool> LaborableSegun(BusinessSchedule? schedule)
        => schedule is not null
            ? schedule.IsWorkingDay
            : dia => WorkingDays.Includes(WorkingDays.MondayToFriday, dia);

    /// <summary>Los feriados de un horario, o ninguno si no hay horario.</summary>
    public static Func<DateOnly, bool> FeriadosSegun(BusinessSchedule? schedule)
        => schedule is null
            ? _ => false
            : fecha => schedule.Holidays.Any(h => h.Date == fecha);
}
