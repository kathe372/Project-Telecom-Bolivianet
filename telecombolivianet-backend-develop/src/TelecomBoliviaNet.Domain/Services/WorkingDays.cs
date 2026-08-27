namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Qué días de la semana se trabaja, codificados en el entero
/// <c>BusinessSchedule.WorkingDaysMask</c>: un bit por día, lunes = 1.
///
/// <para>Esta regla estaba escrita <b>cuatro veces</b> (F5): en
/// <c>BusinessSchedule.IsWorkingDay</c>, que es la que usa el cálculo de SLA;
/// como método privado en la consulta de huecos de instalación; otra vez igual en
/// la de visitas de ticket; y una cuarta con un array de bits aparte para pintar
/// los nombres en la pantalla de configuración.</para>
///
/// <para>Las cuatro coincidían. El problema no era que estuvieran mal, sino que
/// nada obligaba a que siguieran coincidiendo: corregir el bit del domingo en la
/// entidad habría dejado el calendario ofreciendo huecos en un día que el horario
/// declara cerrado, y ningún test lo habría notado.</para>
/// </summary>
public static class WorkingDays
{
    /// <summary>Bit de cada día, empezando en lunes.</summary>
    private static readonly (DayOfWeek Day, int Bit, string Name)[] Table =
    [
        (DayOfWeek.Monday,     1, "Lunes"),
        (DayOfWeek.Tuesday,    2, "Martes"),
        (DayOfWeek.Wednesday,  4, "Miércoles"),
        (DayOfWeek.Thursday,   8, "Jueves"),
        (DayOfWeek.Friday,    16, "Viernes"),
        (DayOfWeek.Saturday,  32, "Sábado"),
        (DayOfWeek.Sunday,    64, "Domingo"),
    ];

    /// <summary>
    /// De lunes a viernes (1+2+4+8+16). Es el horario que se asume cuando no hay
    /// ninguno configurado, y el que trae el horario sembrado.
    /// </summary>
    public const int MondayToFriday = 31;

    /// <summary>Todos los días (1..64). El máximo válido para una máscara.</summary>
    public const int EveryDay = 127;

    /// <summary>¿Se trabaja ese día según la máscara?</summary>
    public static bool Includes(int mask, DayOfWeek day)
    {
        foreach (var (d, bit, _) in Table)
            if (d == day) return (mask & bit) != 0;

        return false;
    }

    /// <summary>
    /// Los días de la máscara con su nombre, de lunes a domingo. Para mostrar el
    /// horario, no para decidir nada.
    /// </summary>
    public static string[] Names(int mask)
        => Table.Where(t => (mask & t.Bit) != 0).Select(t => t.Name).ToArray();

    /// <summary>
    /// ¿La máscara tiene sentido? Cero significaría un horario en el que nunca se
    /// trabaja, y por encima de <see cref="EveryDay"/> hay bits que no
    /// corresponden a ningún día.
    /// </summary>
    public static bool IsValid(int mask) => mask is > 0 and <= EveryDay;
}
