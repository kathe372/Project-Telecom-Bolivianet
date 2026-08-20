using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Plans;

public class Plan : Entity
{
    public string Name           { get; set; } = string.Empty;
    public int    SpeedMb        { get; set; }
    public decimal MonthlyPrice  { get; set; }
    public bool   IsActive       { get; set; } = true;
    public DateTime CreatedAt    { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt   { get; set; }

    public int TecnicosRequeridos       { get; set; } = 1;
    public int DuracionInstalacionMin   { get; set; } = 120;

    public string DisplayLabel =>
        $"{Name} — {SpeedMb} Mb — Bs. {MonthlyPrice:N0}/mes";
}
