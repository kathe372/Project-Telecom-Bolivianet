using FluentAssertions;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// La regla de bloqueo por intentos fallidos vivía escrita en línea dentro de
/// <c>AuthService.LoginAsync</c>, donde solo se podía probar montando un servicio
/// con siete dependencias y pasando por el hasher. Ahora es dominio puro (F5).
/// </summary>
public class LoginLockoutPolicyTests
{
    private static readonly DateTime Ahora = new(2026, 8, 27, 15, 0, 0, DateTimeKind.Utc);

    // ── ¿Está bloqueada ahora mismo? ────────────────────────────────────────

    [Fact]
    public void SinFechaDeBloqueo_NoEstaBloqueada()
        => LoginLockoutPolicy.IsLockedAt(null, Ahora).Should().BeFalse();

    [Fact]
    public void ConBloqueoEnElFuturo_EstaBloqueada()
        => LoginLockoutPolicy.IsLockedAt(Ahora.AddMinutes(1), Ahora).Should().BeTrue();

    [Fact]
    public void ConBloqueoYaVencido_NoEstaBloqueada()
        => LoginLockoutPolicy.IsLockedAt(Ahora.AddMinutes(-1), Ahora).Should().BeFalse();

    [Fact]
    public void JustoAlCumplirseElPlazo_YaNoEstaBloqueada()
        => LoginLockoutPolicy.IsLockedAt(Ahora, Ahora).Should().BeFalse(
            "el bloqueo dura HASTA esa hora, no incluyéndola: si no, el último " +
            "minuto quedaría en tierra de nadie");

    // ── Limpiar un bloqueo caducado ─────────────────────────────────────────

    [Fact]
    public void BloqueoVencido_SeLimpia()
        => LoginLockoutPolicy.ShouldClearExpiredLock(Ahora.AddMinutes(-1), Ahora)
            .Should().BeTrue();

    [Fact]
    public void BloqueoVigente_NoSeLimpia()
        => LoginLockoutPolicy.ShouldClearExpiredLock(Ahora.AddMinutes(5), Ahora)
            .Should().BeFalse();

    [Fact]
    public void SinBloqueo_NoHayNadaQueLimpiar()
        => LoginLockoutPolicy.ShouldClearExpiredLock(null, Ahora).Should().BeFalse();

    // ── Contar un fallo ─────────────────────────────────────────────────────

    [Theory]
    [InlineData(0, 5, 1)]   // primer fallo
    [InlineData(1, 5, 2)]
    [InlineData(3, 5, 4)]   // el último antes del tope
    public void AntesDelTope_SoloSubeElContador(int previos, int tope, int esperado)
    {
        var (intentos, bloqueadoHasta) =
            LoginLockoutPolicy.RegisterFailure(previos, tope, Ahora, lockoutMinutes: 15);

        intentos.Should().Be(esperado);
        bloqueadoHasta.Should().BeNull("aún le quedan oportunidades");
    }

    [Fact]
    public void AlAlcanzarElTope_SeBloquea()
    {
        var (intentos, bloqueadoHasta) =
            LoginLockoutPolicy.RegisterFailure(4, maxAttempts: 5, Ahora, lockoutMinutes: 15);

        intentos.Should().Be(5);
        bloqueadoHasta.Should().Be(Ahora.AddMinutes(15));
    }

    [Fact]
    public void PasadoElTope_SigueBloqueandoYReiniciaLaVentana()
    {
        // Puede ocurrir si el tope de configuración baja mientras hay cuentas con
        // el contador alto. No debe dejar de bloquear por eso.
        var (intentos, bloqueadoHasta) =
            LoginLockoutPolicy.RegisterFailure(9, maxAttempts: 5, Ahora, lockoutMinutes: 15);

        intentos.Should().Be(10);
        bloqueadoHasta.Should().Be(Ahora.AddMinutes(15));
    }

    [Fact]
    public void ElBloqueoEsTemporal_NoPermanente()
    {
        // Regresión: antes el bloqueo ponía Status=Bloqueado para siempre, y si
        // el bloqueado era el único Admin la única salida era ADMIN_RESET_PASSWORD
        // más un redespliegue.
        var (_, bloqueadoHasta) =
            LoginLockoutPolicy.RegisterFailure(4, maxAttempts: 5, Ahora, lockoutMinutes: 15);

        bloqueadoHasta.Should().NotBeNull();
        LoginLockoutPolicy.IsLockedAt(bloqueadoHasta, Ahora.AddMinutes(16))
            .Should().BeFalse("pasada la ventana, la cuenta se rehabilita sola");
    }
}
