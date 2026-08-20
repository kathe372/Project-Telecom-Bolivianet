using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Installations;

public class InstallationTechnician : Entity
{
    public Guid          InstallationId { get; set; }
    public Installation? Installation   { get; set; }
    public Guid          TechnicianId   { get; set; }
    public UserSystem?   Technician     { get; set; }
    public bool          IsLead         { get; set; } = false;
    public DateTime      AssignedAt     { get; set; } = DateTime.UtcNow;
    public Guid          AssignedBy     { get; set; }
}
