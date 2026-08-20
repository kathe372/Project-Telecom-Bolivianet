using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Auth;

public class RefreshToken : Entity
{
    public string TokenHash   { get; set; } = string.Empty;

    public Guid   UserId      { get; set; }

    public DateTime ExpiresAt { get; set; }

    public DateTime? RevokedAt { get; set; }

    public string? ReplacedByTokenHash { get; set; }

    public string? CreatedByIp { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;


    public bool IsExpired => DateTime.UtcNow >= ExpiresAt;
    public bool IsRevoked => RevokedAt.HasValue;
    public bool IsActive  => !IsRevoked && !IsExpired;
}
