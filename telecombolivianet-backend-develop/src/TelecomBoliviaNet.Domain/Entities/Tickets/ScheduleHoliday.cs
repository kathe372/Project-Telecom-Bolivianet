using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Tickets;

public class ScheduleHoliday : Entity
{
    public Guid               BusinessScheduleId { get; set; }
    public BusinessSchedule?  BusinessSchedule   { get; set; }
    public DateOnly           Date               { get; set; }
    public string             Name               { get; set; } = string.Empty;
}
