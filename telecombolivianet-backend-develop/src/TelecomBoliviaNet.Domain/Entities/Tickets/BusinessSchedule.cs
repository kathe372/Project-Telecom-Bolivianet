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
    /// ¿Se trabaja ese día? La decodificación de la máscara vive en
    /// <see cref="WorkingDays"/>, porque también la necesitan las consultas de
    /// huecos, que trabajan con la máscara suelta y no con esta entidad.
    /// </summary>
    public bool IsWorkingDay(DayOfWeek day) => WorkingDays.Includes(WorkingDaysMask, day);
}
