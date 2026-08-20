using Microsoft.Extensions.Configuration;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

#pragma warning disable CS8981
using r = TelecomBoliviaNet.Domain.Primitives.Result;
#pragma warning restore CS8981

namespace TelecomBoliviaNet.Application.Services.Auth;

public class AuthService
{
    private readonly IGenericRepository<UserSystem>     _userRepo;
    private readonly IGenericRepository<TokenBlacklist> _tokenRepo;
    private readonly JwtTokenService                    _jwtService;
    private readonly RefreshTokenService                _refreshService;
    private readonly AuditService                       _audit;
    private readonly IConfiguration                     _config;
    private readonly IPasswordHasher                    _hasher;

    public AuthService(
        IGenericRepository<UserSystem>     userRepo,
        IGenericRepository<TokenBlacklist> tokenRepo,
        JwtTokenService                    jwtService,
        RefreshTokenService                refreshService,
        AuditService                       audit,
        IConfiguration                     config,
        IPasswordHasher                    hasher)
    {
        _userRepo       = userRepo;
        _tokenRepo      = tokenRepo;
        _jwtService     = jwtService;
        _refreshService = refreshService;
        _audit          = audit;
        _config         = config;
        _hasher         = hasher;
    }


    /// <summary>
    /// Respuesta única para todo fallo de autenticación.
    ///
    /// Antes cada situación devolvía un mensaje distinto ("Email no registrado",
    /// "Cuenta desactivada", "Cuenta bloqueada", "Tu cuenta aún no ha sido
    /// activada"), lo que permitía a cualquiera enumerar correos válidos y su
    /// estado SIN conocer la contraseña. El detalle real queda en la auditoría.
    /// </summary>
    private const string GenericAuthFailure = "Credenciales incorrectas.";

    /// <summary>
    /// Mensaje del bloqueo temporal. No incluye el tiempo restante exacto para no
    /// regalarle al atacante el cronómetro de cuándo reintentar.
    /// </summary>
    private const string TemporaryLockFailure =
        "Demasiados intentos fallidos. La cuenta quedó bloqueada temporalmente; " +
        "intenta nuevamente en unos minutos o restablece tu contraseña.";

    /// <summary>
    /// Hash de descarte con el que se verifica la contraseña cuando el usuario no
    /// existe. Sin esto, un email inexistente respondía de inmediato mientras que
    /// uno válido pagaba el coste de bcrypt: la diferencia de tiempo delataba qué
    /// correos están registrados.
    /// </summary>
    private static readonly string DummyHash =
        "$2a$12$0000000000000000000000000000000000000000000000000000u";

    public async Task<Result<LoginResponseDto>> LoginAsync(LoginDto dto, string ip)
    {
        // El correo se compara sin distinguir mayúsculas ni espacios sobrantes: en PostgreSQL
        // `=` sobre text SÍ distingue mayúsculas, así que un usuario registrado como
        // "admin@telecombolivianet.bo" no podía entrar escribiendo "Admin@TelecomBoliviaNet.bo"
        // — y el mensaje genérico de credenciales le hacía creer que su contraseña era incorrecta.
        var email = (dto.Email ?? string.Empty).Trim().ToLowerInvariant();
        var user  = await _userRepo.FirstOrDefaultAsync(u => u.Email.ToLower() == email);

        if (user == null)
        {
            // Se verifica igualmente contra un hash de descarte para que el tiempo
            // de respuesta no revele si el correo existe.
            try { _hasher.Verify(dto.Password, DummyHash); } catch { /* solo consume tiempo */ }

            await _audit.LogAsync("Auth", "LOGIN_FAILED",
                $"Email no registrado: {dto.Email}", ip: ip);
            return Result<LoginResponseDto>.Failure(GenericAuthFailure);
        }

        if (user.Status is UserStatus.Inactivo or UserStatus.Bloqueado or UserStatus.PendienteActivacion)
        {
            await _audit.LogAsync("Auth", "LOGIN_FAILED",
                $"Intento de acceso con cuenta en estado {user.Status}.",
                userId: user.Id, userName: user.FullName, ip: ip);
            return Result<LoginResponseDto>.Failure(GenericAuthFailure);
        }

        var now = DateTime.UtcNow;

        // Bloqueo TEMPORAL vigente: se rechaza sin verificar la contraseña, para
        // que la ventana de castigo detenga de verdad la fuerza bruta. El mensaje
        // sí informa del bloqueo (patrón Auth0/Cognito): quien lo provocó ya sabía
        // que la cuenta existe, y al usuario legítimo le explica qué hacer.
        if (user.LockedUntil is { } lockedUntil && lockedUntil > now)
        {
            await _audit.LogAsync("Auth", "LOGIN_FAILED",
                $"Intento durante bloqueo temporal (hasta {lockedUntil:HH:mm} UTC).",
                userId: user.Id, userName: user.FullName, ip: ip);
            return Result<LoginResponseDto>.Failure(TemporaryLockFailure);
        }

        // Bloqueo expirado: la cuenta se rehabilita sola y el contador arranca
        // de cero. Antes el bloqueo era PERMANENTE (Status=Bloqueado): si el
        // bloqueado era el único Admin, la salida era RESET_ADMIN + redespliegue.
        if (user.LockedUntil is not null)
        {
            user.LockedUntil         = null;
            user.FailedLoginAttempts = 0;
        }

        if (!_hasher.Verify(dto.Password, user.PasswordHash))
        {
            user.FailedLoginAttempts++;
            var maxAttempts = int.Parse(_config["Security:MaxFailedLoginAttempts"] ?? "5");

            if (user.FailedLoginAttempts >= maxAttempts)
            {
                user.LockedUntil = now.AddMinutes(AppConstants.Security.LockoutMinutes);
                await _audit.LogAsync("Auth", "ACCOUNT_LOCKED_TEMP",
                    $"Cuenta bloqueada {AppConstants.Security.LockoutMinutes} min tras {maxAttempts} intentos fallidos.",
                    userId: user.Id, userName: user.FullName, ip: ip,
                    newData: $"{{\"lockedUntil\":\"{user.LockedUntil:O}\"}}");
            }

            await _userRepo.UpdateAsync(user);
            await _audit.LogAsync("Auth", "LOGIN_FAILED",
                $"Contrasena incorrecta. Intento #{user.FailedLoginAttempts}.",
                userId: user.Id, userName: user.FullName, ip: ip);

            return Result<LoginResponseDto>.Failure(
                user.LockedUntil is not null ? TemporaryLockFailure : GenericAuthFailure);
        }

        user.FailedLoginAttempts = 0;
        user.LockedUntil         = null;
        user.LastLoginAt         = DateTime.UtcNow;
        await _userRepo.UpdateAsync(user);

        var accessToken  = _jwtService.GenerateToken(user);
        var refreshToken = await _refreshService.GenerateAsync(user.Id, ip);

        await _audit.LogAsync("Auth", "LOGIN_SUCCESS", "Inicio de sesion exitoso.",
            userId: user.Id, userName: user.FullName, ip: ip);

        var redirect = user.Role switch
        {
            UserRole.Admin        => "/dashboard",
            UserRole.Tecnico      => "/tickets",
            UserRole.SocioLectura => "/dashboard",
            _                     => "/dashboard"
        };

        return Result<LoginResponseDto>.Success(new LoginResponseDto(
            Token:                  accessToken,
            RefreshToken:           refreshToken,
            UserId:                 user.Id.ToString(),
            FullName:               user.FullName,
            Email:                  user.Email,
            Role:                   user.Role.ToString(),
            RequiresPasswordChange: user.RequiresPasswordChange,
            RedirectUrl:            redirect
        ));
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


    public async Task<r> ChangePasswordAsync(Guid userId, ChangePasswordDto dto, string ip)
    {
        var user = await _userRepo.GetByIdAsync(userId);
        if (user == null) return Result.Failure("Usuario no encontrado.");

        if (user.Status != UserStatus.Activo)
            return Result.Failure("La cuenta no está activa. Contacte al administrador.");

        if (!_hasher.Verify(dto.CurrentPassword, user.PasswordHash))
            return Result.Failure("La contrasena actual es incorrecta.");

        if (_hasher.Verify(dto.NewPassword, user.PasswordHash))
            return Result.Failure("La nueva contrasena no puede ser igual a la actual.");

        user.PasswordHash           = _hasher.Hash(dto.NewPassword);
        user.RequiresPasswordChange = false;
        user.UpdatedAt              = DateTime.UtcNow;
        await _userRepo.UpdateAsync(user);

        // Cambiar la contraseña debe cerrar las sesiones abiertas: si se cambia
        // por sospecha de robo, antes el atacante conservaba acceso hasta 30 días
        // porque su refresh token seguía siendo válido.
        await _refreshService.RevokeAllForUserAsync(user.Id, "Cambio de contraseña");

        await _audit.LogAsync("Auth", "PASSWORD_CHANGED", "Contrasena cambiada.",
            userId: user.Id, userName: user.FullName, ip: ip);

        return Result.Success();
    }
}
