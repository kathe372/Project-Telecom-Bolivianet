using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Entrar al sistema. Seguir dentro es cosa de <see cref="ISessionService"/>.
/// </summary>
public interface IAuthService
{
    Task<Result<LoginResponseDto>> LoginAsync(LoginDto dto, string ip);
}

/// <summary>
/// El ciclo de vida de una sesión ya iniciada: renovarla, cerrarla y comprobar
/// si su token fue revocado.
/// </summary>
public interface ISessionService
{
    Task<Result<RefreshResponseDto>> RefreshAsync(string rawRefreshToken, string ip);

    Task<Result> LogoutAsync(
        string rawToken, string? rawRefreshToken, Guid userId, string userName, string ip);

    /// <summary>
    /// ¿Este token de acceso fue revocado antes de expirar? Lo consulta el
    /// middleware en cada petición.
    /// </summary>
    Task<bool> IsTokenBlacklistedAsync(string rawToken);
}

/// <summary>Cambiar la contraseña de quien ya inició sesión.</summary>
public interface IPasswordChangeService
{
    Task<Result> ChangePasswordAsync(Guid userId, ChangePasswordDto dto, string ip);
}
