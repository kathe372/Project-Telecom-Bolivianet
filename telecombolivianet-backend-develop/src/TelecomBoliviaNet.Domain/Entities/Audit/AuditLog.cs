using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Audit;

public class AuditLog : Entity
{
    public Guid? UserId { get; set; }
    public string UserName { get; set; } = "Sistema";
    public string Module { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Guid? EntityId { get; set; }
    public string? IpAddress   { get; set; }
    public string? UserAgent   { get; set; }
    public string? PreviousData { get; set; }
    public string? NewData      { get; set; }
    public DateTime CreatedAt  { get; set; } = DateTime.UtcNow;
    public string? IntegrityHash { get; set; }
}
