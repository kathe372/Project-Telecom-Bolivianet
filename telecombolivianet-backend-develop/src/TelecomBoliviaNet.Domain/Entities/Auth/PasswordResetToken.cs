using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Auth;

public class PasswordResetToken : Entity
{
    public Guid      UserId     { get; set; }
    public string    Token      { get; set; } = string.Empty;
    public DateTime  ExpiresAt  { get; set; }
    public bool      Used       { get; set; } = false;
    public DateTime  CreatedAt  { get; set; } = DateTime.UtcNow;
    public string?   SentTo     { get; set; }
    public string    Channel    { get; set; } = "WhatsApp";

    public bool IsExpired => DateTime.UtcNow > ExpiresAt;
}
