using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Plans;

public class PlanHistory : Entity
{
    public Guid    PlanId        { get; set; }
    public Plan?   Plan          { get; set; }

    public string  Name          { get; set; } = string.Empty;
    public int     SpeedMb       { get; set; }
    public decimal MonthlyPrice  { get; set; }
    public bool    IsActive      { get; set; }

    public DateTime ChangedAt    { get; set; } = DateTime.UtcNow;
    public Guid     ChangedById  { get; set; }
    public string   ChangedByName { get; set; } = string.Empty;

    public string?  ChangeReason { get; set; }
}
