using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Tickets;

public class BusinessSchedule : Entity
{
    public string Name           { get; set; } = string.Empty;
    public string TimeZoneName   { get; set; } = string.Empty;
    public int    UtcOffsetHours { get; set; } = -4;
    public int    WorkingDaysMask{ get; set; } = 31;
    public int    StartHour      { get; set; } = 8;
    public int    EndHour        { get; set; } = 18;
    public bool   Is24x7         { get; set; } = false;
    public bool   IsDefault      { get; set; } = false;
    public bool   IsActive       { get; set; } = true;
    public DateTime CreatedAt    { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt   { get; set; }

    public ICollection<ScheduleHoliday> Holidays { get; set; } = new List<ScheduleHoliday>();

    public bool IsWorkingDay(DayOfWeek day) => day switch
    {
        DayOfWeek.Monday    => (WorkingDaysMask & 1)  != 0,
        DayOfWeek.Tuesday   => (WorkingDaysMask & 2)  != 0,
        DayOfWeek.Wednesday => (WorkingDaysMask & 4)  != 0,
        DayOfWeek.Thursday  => (WorkingDaysMask & 8)  != 0,
        DayOfWeek.Friday    => (WorkingDaysMask & 16) != 0,
        DayOfWeek.Saturday  => (WorkingDaysMask & 32) != 0,
        DayOfWeek.Sunday    => (WorkingDaysMask & 64) != 0,
        _                   => false
    };
}
