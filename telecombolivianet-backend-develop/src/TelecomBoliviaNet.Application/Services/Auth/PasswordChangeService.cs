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
/// Cambiar la contraseña de quien ya inició sesión.
///
/// <para>Extraído de <c>AuthService</c> (F5). No comparte nada con el inicio de
/// sesión salvo el verificador de contraseñas: aquí el usuario ya está
/// autenticado y lo que se hace es sustituir su hash y revocar sus sesiones.</para>
/// </summary>
public class PasswordChangeService : IPasswordChangeService
{
    private readonly IGenericRepository<UserSystem> _userRepo;
    private readonly RefreshTokenService            _refreshService;
    private readonly AuditService                   _audit;
    private readonly IPasswordHasher                _hasher;

    public PasswordChangeService(
        IGenericRepository<UserSystem> userRepo,
        RefreshTokenService            refreshService,
        AuditService                   audit,
        IPasswordHasher                hasher)
    {
        _userRepo       = userRepo;
        _refreshService = refreshService;
        _audit          = audit;
        _hasher         = hasher;
    }

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
        _userRepo.Update(user);
        await _userRepo.SaveChangesAsync();
        // Cambiar la contraseña debe cerrar las sesiones abiertas: si se cambia
        // por sospecha de robo, antes el atacante conservaba acceso hasta 30 días
        // porque su refresh token seguía siendo válido.
        await _refreshService.RevokeAllForUserAsync(user.Id, "Cambio de contraseña");

        await _audit.LogAsync("Auth", "PASSWORD_CHANGED", "Contrasena cambiada.",
            userId: user.Id, userName: user.FullName, ip: ip);

        return Result.Success();
    }
}
