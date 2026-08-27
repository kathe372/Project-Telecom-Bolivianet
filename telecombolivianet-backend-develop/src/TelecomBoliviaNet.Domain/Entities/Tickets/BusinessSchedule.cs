using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Domain.Entities.Tickets;

public class BusinessSchedule : Entity
{
    public string Name           { get; set; } = string.Empty;
    public string TimeZoneName   { get; set; } = string.Empty;
    public int    UtcOffsetHours { get; set; } = -4;
    public int    WorkingDaysMask{ get; set; } = WorkingDays.MondayToFriday;
    public int    StartHour      { get; set; } = 8;
    public int    EndHour        { get; set; } = 18;
    public bool   Is24x7         { get; set; } = false;
    public bool   IsDefault      { get; set; } = false;
    public bool   IsActive       { get; set; } = true;
    public DateTime CreatedAt    { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt   { get; set; }

    public ICollection<ScheduleHoliday> Holidays { get; set; } = new List<ScheduleHoliday>();

    /// <summary>
    /// ¿Se trabaja ese día?
    ///
    /// <para>Un horario 24x7 trabaja todos, sin mirar la máscara. Antes esto no
    /// lo contemplaba y el resultado dependía de quién preguntara: el cálculo de
    /// SLA trata el 24x7 aparte y nunca llega aquí, pero las consultas de huecos
    /// sí, y con una máscara vacía —que el validador deja pasar justamente cuando
    /// <c>Is24x7</c> es true— dejaban el calendario sin un solo hueco, todos los
    /// días, en silencio.</para>
    ///
    /// <para>La decodificación de la máscara vive en <see cref="WorkingDays"/>,
    /// porque también la necesitan quienes trabajan con la máscara suelta y no
    /// con esta entidad.</para>
    /// </summary>
    public bool IsWorkingDay(DayOfWeek day)
        => Is24x7 || WorkingDays.Includes(WorkingDaysMask, day);

    /// <summary>
    /// Franja horaria en la que se atiende, como par [desde, hasta). Un horario
    /// 24x7 cubre el día entero, sin mirar <see cref="StartHour"/> ni
    /// <see cref="EndHour"/> — que en ese caso pueden valer cualquier cosa,
    /// porque el validador no los comprueba.
    /// </summary>
    public (int From, int To) OpenHours => Is24x7 ? (0, 24) : (StartHour, EndHour);
}
