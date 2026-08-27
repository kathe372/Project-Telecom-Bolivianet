using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

#pragma warning disable CS8981
using r = TelecomBoliviaNet.Domain.Primitives.Result;
#pragma warning restore CS8981

namespace TelecomBoliviaNet.Application.Services.Auth;

/// <summary>
/// El ciclo de vida de una sesión ya iniciada: renovarla, cerrarla y comprobar
/// si su token fue revocado.
///
/// <para>Extraído de <c>AuthService</c> (F5), que además autenticaba y cambiaba
/// contraseñas en 255 líneas. Entrar y seguir dentro son dos cosas distintas: la
/// primera valida credenciales y cuenta intentos fallidos, la segunda solo
/// maneja tokens.</para>
/// </summary>
public class SessionService : ISessionService
{
    private readonly IGenericRepository<UserSystem>     _userRepo;
    private readonly IGenericRepository<TokenBlacklist> _tokenRepo;
    private readonly JwtTokenService                    _jwtService;
    private readonly RefreshTokenService                _refreshService;
    private readonly AuditService                       _audit;

    public SessionService(
        IGenericRepository<UserSystem>     userRepo,
        IGenericRepository<TokenBlacklist> tokenRepo,
        JwtTokenService                    jwtService,
        RefreshTokenService                refreshService,
        AuditService                       audit)
    {
        _userRepo       = userRepo;
        _tokenRepo      = tokenRepo;
        _jwtService     = jwtService;
        _refreshService = refreshService;
        _audit          = audit;
    }

    public async Task<Result<RefreshResponseDto>> RefreshAsync(string rawRefreshToken, string ip)
    {
        var (entity, newRawToken) = await _refreshService.RotateAsync(rawRefreshToken, ip);

        if (entity is null || newRawToken is null)
            return Result<RefreshResponseDto>.Failure("Refresh token invalido, expirado o revocado.");

        var user = await _userRepo.GetByIdAsync(entity.UserId);
        if (user is null || user.Status != UserStatus.Activo)
            return Result<RefreshResponseDto>.Failure("Usuario no encontrado o inactivo.");

        var newAccessToken = _jwtService.GenerateToken(user);

        return Result<RefreshResponseDto>.Success(
            new RefreshResponseDto(Token: newAccessToken, RefreshToken: newRawToken));
    }


    public async Task<r> LogoutAsync(
        string rawToken, string? rawRefreshToken,
        Guid userId, string userName, string ip)
    {
        var expiration = _jwtService.GetExpiration(rawToken);
        await _tokenRepo.AddAsync(new TokenBlacklist
        {
            Token         = rawToken,
            UserId        = userId,
            ExpiresAt     = expiration,
            InvalidatedAt = DateTime.UtcNow
        });
        await _tokenRepo.SaveChangesAsync();

        // Se revoca siempre, no solo si el cliente envió el refresh token: un
        // logout desde un cliente que no lo manda dejaba viva la sesión larga.
        await _refreshService.RevokeAllForUserAsync(userId, "Logout explicito");

        await _audit.LogAsync("Auth", "LOGOUT", "Cierre de sesion.",
            userId: userId, userName: userName, ip: ip);

        return Result.Success();
    }


    public async Task<bool> IsTokenBlacklistedAsync(string rawToken)
        => await _tokenRepo.AnyAsync(t => t.Token == rawToken);
}
