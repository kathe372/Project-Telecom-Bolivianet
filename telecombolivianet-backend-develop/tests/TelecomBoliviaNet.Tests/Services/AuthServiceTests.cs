using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Tests unitarios para AuthService.
/// Cubre: Login (exitoso, credenciales incorrectas, cuenta bloqueada, bloqueo tras intentos),
/// Refresh, Logout, ChangePassword, IsTokenBlacklisted.
/// </summary>
public class AuthServiceTests
{
    private static readonly Guid UserId   = Guid.NewGuid();
    private const string ValidEmail       = "admin@telecombolivianet.bo";
    private const string ValidPassword    = "Segura123!";
    private const string HashedPassword   = "HASH_SIMULADO";

    // ── Helpers de construcción ───────────────────────────────────────────────

    private static IConfiguration MakeConfig(int maxAttempts = 5) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"]                        = "SuperSecretKey1234567890_AtLeast32Chars!!",
                ["Jwt:Issuer"]                     = "TelecomBoliviaNet",
                ["Jwt:Audience"]                   = "TelecomBoliviaNet",
                ["Jwt:ExpirationHours"]            = "8",
                ["Jwt:RefreshTokenExpirationDays"] = "30",
                ["Security:MaxFailedLoginAttempts"]= maxAttempts.ToString()
            })
            .Build();

    private static JwtTokenService MakeJwt(IConfiguration? cfg = null) =>
        new JwtTokenService(cfg ?? MakeConfig(), NullLogger<JwtTokenService>.Instance);

    private static RefreshTokenService MakeRefresh(
        IConfiguration? cfg = null,
        params RefreshToken[] tokens)
    {
        var repo = RepoMock.Of(tokens);
        return new RefreshTokenService(repo.Object, cfg ?? MakeConfig(),
                                       NullLogger<RefreshTokenService>.Instance);
    }

    private static AuditService MakeAudit() =>
        new AuditService(RepoMock.Empty<AuditLog>().Object,
                         NullLogger<AuditService>.Instance);

    private static Mock<IPasswordHasher> MakeHasher(bool verifyResult = true)
    {
        var mock = new Mock<IPasswordHasher>();
        mock.Setup(h => h.Verify(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(verifyResult);
        mock.Setup(h => h.Hash(It.IsAny<string>()))
            .Returns("NUEVO_HASH");
        return mock;
    }

    private static UserSystem MakeUser(
        UserStatus status = UserStatus.Activo,
        int failedAttempts = 0,
        bool requiresChange = false) => new()
    {
        Id                    = UserId,
        Email                 = ValidEmail,
        FullName              = "Administrador",
        PasswordHash          = HashedPassword,
        Role                  = UserRole.Admin,
        Status                = status,
        FailedLoginAttempts   = failedAttempts,
        RequiresPasswordChange = requiresChange,
    };

    private AuthService MakeService(
        UserSystem? user             = null,
        IPasswordHasher? hasher      = null,
        int maxAttempts              = 5,
        params RefreshToken[] tokens)
    {
        var cfg        = MakeConfig(maxAttempts);
        var userRepo   = user is null ? RepoMock.Empty<UserSystem>() : RepoMock.Of(user);
        var tokenRepo  = RepoMock.Empty<TokenBlacklist>();
        var jwtSvc     = MakeJwt(cfg);
        var refreshSvc = MakeRefresh(cfg, tokens);
        var audit      = MakeAudit();
        var pwd        = hasher ?? MakeHasher().Object;

        return new AuthService(userRepo.Object, tokenRepo.Object,
                               jwtSvc, refreshSvc, audit, cfg, pwd);
    }

    // ── Auditoría 2026-08-06 · El correo no distingue mayúsculas ────────────
    // En PostgreSQL `=` sobre text SÍ distingue mayúsculas: un usuario registrado en minúsculas
    // no podía entrar si escribía su correo capitalizado, y el mensaje genérico de credenciales
    // le hacía creer que su contraseña estaba mal.

    [Theory]
    [InlineData("admin@telecombolivianet.bo")]
    [InlineData("Admin@TelecomBoliviaNet.bo")]
    [InlineData("ADMIN@TELECOMBOLIVIANET.BO")]
    [InlineData("  admin@telecombolivianet.bo  ")]
    public async Task Login_CorreoConOtraCapitalizacionOEspacios_IniciaSesionIgual(string email)
    {
        var service = MakeService(user: MakeUser(), hasher: MakeHasher(true).Object);

        var result = await service.LoginAsync(new LoginDto(email, ValidPassword), "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        result.Value!.Email.Should().Be(ValidEmail);
    }

    [Fact]
    public async Task Login_CorreoDistinto_SigueRechazando()
    {
        var service = MakeService(user: MakeUser(), hasher: MakeHasher(true).Object);

        var result = await service.LoginAsync(
            new LoginDto("otro@telecombolivianet.bo", ValidPassword), "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
    }

    // ── TC-AUTH-01 · Login exitoso devuelve token y datos de sesión ──────────

    [Fact]
    public async Task Login_ValidCredentials_ReturnsSuccessWithToken()
    {
        var user    = MakeUser();
        var service = MakeService(user: user, hasher: MakeHasher(true).Object);

        var result = await service.LoginAsync(
            new LoginDto(ValidEmail, ValidPassword), "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        result.Value!.Token.Should().NotBeNullOrEmpty();
        result.Value.UserId.Should().Be(UserId.ToString());
        result.Value.Role.Should().Be("Admin");
    }

    // ── TC-AUTH-02 · Login con email desconocido → Failure ──────────────────

    [Fact]
    public async Task Login_UnknownEmail_ReturnsFail()
    {
        var service = MakeService(); // repo vacío — sin usuarios

        var result = await service.LoginAsync(
            new LoginDto("noexiste@x.bo", "cualquiera"), "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("Credenciales");
    }

    // ── TC-AUTH-03 · Login con contraseña incorrecta → Failure ──────────────

    [Fact]
    public async Task Login_WrongPassword_ReturnsFail()
    {
        var user    = MakeUser();
        var service = MakeService(user: user, hasher: MakeHasher(false).Object);

        var result = await service.LoginAsync(
            new LoginDto(ValidEmail, "Incorrecta!"), "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("Credenciales");
    }

    // ── TC-AUTH-04/05 · El fallo de login NO revela el estado de la cuenta ───
    //
    // CAMBIO DELIBERADO (auditoría 2026-08-01): antes cada situación devolvía un
    // mensaje distinto ("Cuenta bloqueada", "Cuenta desactivada", "Email no
    // registrado", "Tu cuenta aún no ha sido activada"). Eso permitía a cualquiera
    // enumerar correos válidos y su estado SIN conocer la contraseña. Ahora todos
    // los fallos comparten mensaje y el detalle queda en la auditoría.

    [Theory]
    [InlineData(UserStatus.Bloqueado)]
    [InlineData(UserStatus.Inactivo)]
    [InlineData(UserStatus.PendienteActivacion)]
    public async Task Login_CuentaNoUtilizable_NoRevelaElEstado(UserStatus status)
    {
        var user    = MakeUser(status: status);
        var service = MakeService(user: user);

        var result = await service.LoginAsync(
            new LoginDto(ValidEmail, ValidPassword), "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Be("Credenciales incorrectas.");
        result.ErrorMessage.Should().NotContainAny("bloquead", "desactivad", "activad", "registrad");
    }

    [Fact]
    public async Task Login_EmailInexistente_DevuelveElMismoMensajeQueUnaClaveIncorrecta()
    {
        // Si los mensajes difirieran, bastaría con probar correos para descubrir
        // cuáles están registrados en el sistema.
        var inexistente = await MakeService(user: null).LoginAsync(
            new LoginDto("nadie@telecombolivianet.bo", ValidPassword), "127.0.0.1");

        var claveMala = await MakeService(user: MakeUser(), hasher: MakeHasher(false).Object)
            .LoginAsync(new LoginDto(ValidEmail, "Incorrecta!"), "127.0.0.1");

        inexistente.IsSuccess.Should().BeFalse();
        claveMala.IsSuccess.Should().BeFalse();
        inexistente.ErrorMessage.Should().Be(claveMala.ErrorMessage);
    }

    // ── TC-AUTH-06 · Intento máximo de contraseña incorrecta bloquea cuenta ──

    [Fact]
    public async Task Login_MaxFailedAttempts_BlocksAccount()
    {
        // Usuario con 4 intentos fallidos — el 5to debe bloquear
        var user    = MakeUser(failedAttempts: 4);
        var hasher  = MakeHasher(false); // contraseña siempre incorrecta
        var userRepo = RepoMock.Of(user);

        var cfg        = MakeConfig(maxAttempts: 5);
        var tokenRepo  = RepoMock.Empty<TokenBlacklist>();
        var jwtSvc     = MakeJwt(cfg);
        var refreshSvc = MakeRefresh(cfg);
        var audit      = MakeAudit();

        var service = new AuthService(userRepo.Object, tokenRepo.Object,
                                      jwtSvc, refreshSvc, audit, cfg, hasher.Object);

        var result = await service.LoginAsync(
            new LoginDto(ValidEmail, "Mal!"), "127.0.0.1");

        result.IsSuccess.Should().BeFalse();

        // CAMBIO DELIBERADO (auditoría 2026-08-01): el bloqueo por intentos es
        // TEMPORAL (LockedUntil), no Status=Bloqueado. El permanente dejaba al
        // único Admin fuera del sistema hasta un RESET_ADMIN + redespliegue;
        // Bloqueado queda reservado para el bloqueo administrativo manual.
        userRepo.Verify(r => r.UpdateAsync(
            It.Is<UserSystem>(u =>
                u.Status == UserStatus.Activo &&
                u.LockedUntil != null && u.LockedUntil > DateTime.UtcNow)),
            Times.Once);
    }

    // ── Bloqueo temporal: comportamiento estándar (Auth0/Cognito) ────────────

    [Fact]
    public async Task Login_DuranteBloqueoTemporal_RechazaInclusoConPasswordCorrecta()
    {
        var user = MakeUser();
        user.LockedUntil = DateTime.UtcNow.AddMinutes(10);
        // hasher devolvería true — pero durante el bloqueo NI SIQUIERA se verifica
        var service = MakeService(user: user, hasher: MakeHasher(true).Object);

        var result = await service.LoginAsync(
            new LoginDto(ValidEmail, ValidPassword), "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("temporalmente");
    }

    [Fact]
    public async Task Login_BloqueoExpirado_PermiteEntrarYLimpiaElContador()
    {
        // El desbloqueo es AUTOMÁTICO al expirar la ventana: nadie queda atrapado.
        var user = MakeUser(failedAttempts: 5);
        user.LockedUntil = DateTime.UtcNow.AddMinutes(-1);
        var userRepo = RepoMock.Of(user);
        var cfg      = MakeConfig();
        var service  = new AuthService(userRepo.Object, RepoMock.Empty<TokenBlacklist>().Object,
                                       MakeJwt(cfg), MakeRefresh(cfg), MakeAudit(), cfg,
                                       MakeHasher(true).Object);

        var result = await service.LoginAsync(
            new LoginDto(ValidEmail, ValidPassword), "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        userRepo.Verify(r => r.UpdateAsync(
            It.Is<UserSystem>(u => u.LockedUntil == null && u.FailedLoginAttempts == 0)),
            Times.Once);
    }

    [Fact]
    public async Task Login_BloqueoExpiradoYPasswordIncorrecta_ReiniciaElContadorEnUno()
    {
        // Tras expirar el bloqueo, un fallo nuevo NO re-bloquea de inmediato:
        // el contador arranca de cero y vuelve a acumular hasta el máximo.
        var user = MakeUser(failedAttempts: 5);
        user.LockedUntil = DateTime.UtcNow.AddMinutes(-1);
        var userRepo = RepoMock.Of(user);
        var cfg      = MakeConfig(maxAttempts: 5);
        var service  = new AuthService(userRepo.Object, RepoMock.Empty<TokenBlacklist>().Object,
                                       MakeJwt(cfg), MakeRefresh(cfg), MakeAudit(), cfg,
                                       MakeHasher(false).Object);

        var result = await service.LoginAsync(
            new LoginDto(ValidEmail, "Mal!"), "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        userRepo.Verify(r => r.UpdateAsync(
            It.Is<UserSystem>(u => u.FailedLoginAttempts == 1 && u.LockedUntil == null)),
            Times.Once);
    }

    // ── TC-AUTH-07 · Redirección por rol ─────────────────────────────────────

    [Theory]
    [InlineData(UserRole.Admin,        "/dashboard")]
    [InlineData(UserRole.Tecnico,      "/tickets")]
    [InlineData(UserRole.SocioLectura, "/dashboard")]
    public async Task Login_ByRole_ReturnsCorrectRedirectUrl(UserRole role, string expectedUrl)
    {
        var user = new UserSystem
        {
            Id = Guid.NewGuid(), Email = ValidEmail,
            FullName = "Test", PasswordHash = HashedPassword,
            Role = role, Status = UserStatus.Activo,
        };

        var service = MakeService(user: user, hasher: MakeHasher(true).Object);

        var result = await service.LoginAsync(
            new LoginDto(ValidEmail, ValidPassword), "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        result.Value!.RedirectUrl.Should().Be(expectedUrl);
    }

    // ── TC-AUTH-08 · Login exitoso resetea intentos fallidos a cero ──────────

    [Fact]
    public async Task Login_AfterPreviousFailures_ResetsFailedAttempts()
    {
        var user     = MakeUser(failedAttempts: 3);
        var userRepo = RepoMock.Of(user);
        var hasher   = MakeHasher(true);

        var cfg       = MakeConfig();
        var tokenRepo = RepoMock.Empty<TokenBlacklist>();
        var jwtSvc    = MakeJwt(cfg);
        var refresh   = MakeRefresh(cfg);
        var audit     = MakeAudit();

        var service = new AuthService(userRepo.Object, tokenRepo.Object,
                                      jwtSvc, refresh, audit, cfg, hasher.Object);

        var result = await service.LoginAsync(
            new LoginDto(ValidEmail, ValidPassword), "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        userRepo.Verify(r => r.UpdateAsync(
            It.Is<UserSystem>(u => u.FailedLoginAttempts == 0)),
            Times.Once);
    }

    // ── TC-AUTH-09 · IsTokenBlacklisted devuelve true si el token está en lista ─

    [Fact]
    public async Task IsTokenBlacklisted_KnownToken_ReturnsTrue()
    {
        var rawToken   = "mi.jwt.token";
        var blacklisted = new TokenBlacklist
        {
            Id     = Guid.NewGuid(),
            Token  = rawToken,
            UserId = UserId,
            ExpiresAt     = DateTime.UtcNow.AddHours(8),
            InvalidatedAt = DateTime.UtcNow
        };

        var tokenRepo = RepoMock.Of(blacklisted);
        var userRepo  = RepoMock.Empty<UserSystem>();
        var cfg       = MakeConfig();

        var service = new AuthService(userRepo.Object, tokenRepo.Object,
                                      MakeJwt(cfg), MakeRefresh(cfg), MakeAudit(),
                                      cfg, MakeHasher().Object);

        var result = await service.IsTokenBlacklistedAsync(rawToken);

        result.Should().BeTrue();
    }

    // ── TC-AUTH-10 · IsTokenBlacklisted devuelve false si token no está en lista ─

    [Fact]
    public async Task IsTokenBlacklisted_UnknownToken_ReturnsFalse()
    {
        var service = MakeService(); // repo vacío

        var result = await service.IsTokenBlacklistedAsync("token.no.registrado");

        result.Should().BeFalse();
    }

    // ── TC-AUTH-11 · ChangePassword correcto actualiza hash ─────────────────

    [Fact]
    public async Task ChangePassword_ValidData_UpdatesHash()
    {
        var user     = MakeUser();
        var userRepo = RepoMock.Of(user);
        var hasher   = new Mock<IPasswordHasher>();
        hasher.Setup(h => h.Verify("Actual123!", HashedPassword)).Returns(true);
        hasher.Setup(h => h.Verify("Nueva456!",  HashedPassword)).Returns(false);
        hasher.Setup(h => h.Hash("Nueva456!")).Returns("NUEVO_HASH");

        var cfg     = MakeConfig();
        var service = new AuthService(userRepo.Object, RepoMock.Empty<TokenBlacklist>().Object,
                                      MakeJwt(cfg), MakeRefresh(cfg), MakeAudit(),
                                      cfg, hasher.Object);

        var result = await service.ChangePasswordAsync(UserId,
            new ChangePasswordDto("Actual123!", "Nueva456!", "Nueva456!"), "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        userRepo.Verify(r => r.UpdateAsync(
            It.Is<UserSystem>(u =>
                u.PasswordHash             == "NUEVO_HASH" &&
                u.RequiresPasswordChange   == false)),
            Times.Once);
    }

    // ── TC-AUTH-12 · ChangePassword rechaza si la contraseña actual es incorrecta ─

    [Fact]
    public async Task ChangePassword_WrongCurrent_ReturnsFail()
    {
        var user    = MakeUser();
        var hasher  = MakeHasher(false); // Verify siempre false
        var service = MakeService(user: user, hasher: hasher.Object);

        var result = await service.ChangePasswordAsync(UserId,
            new ChangePasswordDto("Incorrecta", "Nueva456!", "Nueva456!"), "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("actual");
    }

    // ── TC-AUTH-14 · ChangePassword rechaza si la cuenta no está activa (P11) ──

    [Fact]
    public async Task ChangePassword_InactiveAccount_ReturnsFail()
    {
        var user    = MakeUser(status: UserStatus.Inactivo);
        var service = MakeService(user: user, hasher: MakeHasher(true).Object);

        var result = await service.ChangePasswordAsync(UserId,
            new ChangePasswordDto("Actual123!", "Nueva456!", "Nueva456!"), "127.0.0.1");

        result.IsSuccess.Should().BeFalse("una cuenta desactivada no puede cambiar contraseña");
        result.ErrorMessage.Should().Contain("activa");
    }

    // ── TC-AUTH-13 · ChangePassword rechaza si nueva == actual ──────────────

    [Fact]
    public async Task ChangePassword_SamePassword_ReturnsFail()
    {
        var user     = MakeUser();
        var userRepo = RepoMock.Of(user);

        // Verify devuelve true para ambas contraseñas (son iguales al hash)
        var hasher = new Mock<IPasswordHasher>();
        hasher.Setup(h => h.Verify(It.IsAny<string>(), HashedPassword)).Returns(true);

        var cfg     = MakeConfig();
        var service = new AuthService(userRepo.Object, RepoMock.Empty<TokenBlacklist>().Object,
                                      MakeJwt(cfg), MakeRefresh(cfg), MakeAudit(),
                                      cfg, hasher.Object);

        var result = await service.ChangePasswordAsync(UserId,
            new ChangePasswordDto(ValidPassword, ValidPassword, ValidPassword), "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("igual");
    }
}
