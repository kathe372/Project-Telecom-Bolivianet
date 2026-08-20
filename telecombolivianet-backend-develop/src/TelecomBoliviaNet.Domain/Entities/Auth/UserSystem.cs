using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Auth;

public class UserSystem : Entity
{
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; }
    public UserStatus Status { get; set; } = UserStatus.Activo;
    public bool RequiresPasswordChange { get; set; } = true;
    public bool      IsDeleted  { get; set; } = false;
    public DateTime? DeletedAt  { get; set; }
    public int FailedLoginAttempts { get; set; } = 0;

    /// <summary>
    /// Bloqueo TEMPORAL por intentos fallidos: hasta esta hora la cuenta no
    /// acepta logins, y pasada la hora se desbloquea sola.
    ///
    /// Antes el exceso de intentos ponía <c>Status = Bloqueado</c> — un bloqueo
    /// PERMANENTE que solo otro Admin podía revertir; si el bloqueado era el
    /// único Admin, la salida era RESET_ADMIN=true y un redespliegue.
    /// <c>Bloqueado</c> queda reservado para el bloqueo administrativo manual.
    /// </summary>
    public DateTime? LockedUntil { get; set; }

    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}
