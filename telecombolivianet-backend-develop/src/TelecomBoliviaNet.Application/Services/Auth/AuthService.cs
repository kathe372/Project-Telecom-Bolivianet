using Microsoft.Extensions.Configuration;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

#pragma warning disable CS8981
using r = TelecomBoliviaNet.Domain.Primitives.Result;
#pragma warning restore CS8981

namespace TelecomBoliviaNet.Application.Services.Auth;

/// <summary>
/// Iniciar sesión: valida credenciales, cuenta intentos fallidos y emite los
/// tokens.
///
/// <para>Eran 255 líneas que además renovaban y cerraban sesiones y cambiaban
/// contraseñas (F5). Eso vive en <see cref="SessionService"/> y
/// <see cref="PasswordChangeService"/>.</para>
///
/// <para>La regla de bloqueo por intentos fallidos —la parte con consecuencias
/// de seguridad— subió al dominio como
/// <see cref="TelecomBoliviaNet.Domain.Services.LoginLockoutPolicy"/>, donde se
/// prueba con una tabla de casos y no pasando por el hasher.</para>
/// </summary>
public class AuthService : IAuthService
{
    private readonly IGenericRepository<UserSystem>     _userRepo;
    private readonly JwtTokenService                    _jwtService;
    private readonly RefreshTokenService                _refreshService;
    private readonly AuditService                       _audit;
    private readonly IConfiguration                     _config;
    private readonly IPasswordHasher                    _hasher;

    public AuthService(
        IGenericRepository<UserSystem>     userRepo,
        JwtTokenService                    jwtService,
        RefreshTokenService                refreshService,
        AuditService                       audit,
        IConfiguration                     config,
        IPasswordHasher                    hasher)
    {
        _userRepo       = userRepo;
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
        if (LoginLockoutPolicy.IsLockedAt(user.LockedUntil, now))
        {
            var lockedUntil = user.LockedUntil!.Value;
            await _audit.LogAsync("Auth", "LOGIN_FAILED",
                $"Intento durante bloqueo temporal (hasta {lockedUntil:HH:mm} UTC).",
                userId: user.Id, userName: user.FullName, ip: ip);
            return Result<LoginResponseDto>.Failure(TemporaryLockFailure);
        }

        // Bloqueo expirado: la cuenta se rehabilita sola y el contador arranca
        // de cero. Antes el bloqueo era PERMANENTE (Status=Bloqueado): si el
        // bloqueado era el único Admin, la salida era RESET_ADMIN + redespliegue.
        if (LoginLockoutPolicy.ShouldClearExpiredLock(user.LockedUntil, now))
        {
            user.LockedUntil         = null;
            user.FailedLoginAttempts = 0;
        }

        // D-13 — Esta rama termina en `return`, así que su guardado nunca convive
        // con el del inicio de sesión correcto. Ya es atómico.
        if (!_hasher.Verify(dto.Password, user.PasswordHash))
        {
            var maxAttempts = int.Parse(_config["Security:MaxFailedLoginAttempts"] ?? "5");

            var (intentos, bloqueadoHasta) = LoginLockoutPolicy.RegisterFailure(
                user.FailedLoginAttempts, maxAttempts, now,
                AppConstants.Security.LockoutMinutes);

            user.FailedLoginAttempts = intentos;
            user.LockedUntil         = bloqueadoHasta;

            if (bloqueadoHasta is not null)
            {
                await _audit.LogAsync("Auth", "ACCOUNT_LOCKED_TEMP",
                    $"Cuenta bloqueada {AppConstants.Security.LockoutMinutes} min tras {maxAttempts} intentos fallidos.",
                    userId: user.Id, userName: user.FullName, ip: ip,
                    newData: $"{{\"lockedUntil\":\"{user.LockedUntil:O}\"}}");
            }

            _userRepo.Update(user);

            await _userRepo.SaveChangesAsync();
            await _audit.LogAsync("Auth", "LOGIN_FAILED",
                $"Contrasena incorrecta. Intento #{user.FailedLoginAttempts}.",
                userId: user.Id, userName: user.FullName, ip: ip);

            return Result<LoginResponseDto>.Failure(
                user.LockedUntil is not null ? TemporaryLockFailure : GenericAuthFailure);
        }

        user.FailedLoginAttempts = 0;
        user.LockedUntil         = null;
        user.LastLoginAt         = DateTime.UtcNow;
        _userRepo.Update(user);
        await _userRepo.SaveChangesAsync();
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
}
