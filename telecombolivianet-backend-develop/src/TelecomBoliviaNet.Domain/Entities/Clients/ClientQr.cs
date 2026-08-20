using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Clients;

public class ClientQr : Entity
{
    public Guid     ClientId    { get; set; }
    public Client?  Client      { get; set; }

    public string   ImageUrl    { get; set; } = string.Empty;

    public DateTime? ExpiresAt  { get; set; }

    public bool     IsActive    { get; set; } = true;

    public bool     AlertSent   { get; set; } = false;

    public DateTime UploadedAt  { get; set; } = DateTime.UtcNow;
    public Guid     UploadedById { get; set; }

    public string?  DeactivatedReason { get; set; }
}
