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

    /// <summary>
    /// Deja los campos coherentes con <see cref="Is24x7"/> antes de guardar.
    ///
    /// <para>Un horario 24x7 se almacena con los siete días y de 0 a 24. No es
    /// cosmética: sin esto se guarda lo que mandara el formulario —y la pantalla
    /// no pide horas ni días cuando se marca 24x7, así que llegan en cero—. Los
    /// lectores lo interpretan bien gracias a <see cref="IsWorkingDay"/> y
    /// <see cref="OpenHours"/>, pero el dato guardado seguiría siendo mentira, y
    /// el día que alguien <b>desmarque</b> la casilla esos ceros pasarían a ser
    /// efectivos y el calendario se quedaría sin un solo hueco.</para>
    ///
    /// <para>Normalizando al guardar, desmarcar 24x7 deja un horario válido —toda
    /// la semana, día completo— que el operador puede ajustar.</para>
    /// </summary>
    public void NormalizeSchedule()
    {
        if (!Is24x7) return;

        WorkingDaysMask = WorkingDays.EveryDay;
        StartHour       = 0;
        EndHour         = 24;
    }
}
