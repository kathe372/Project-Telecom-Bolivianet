using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Auth;

public class TokenBlacklist : Entity
{
    public string Token { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public DateTime InvalidatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
}
