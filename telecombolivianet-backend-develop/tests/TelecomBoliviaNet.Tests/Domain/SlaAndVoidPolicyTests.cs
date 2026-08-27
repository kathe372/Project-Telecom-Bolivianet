using FluentAssertions;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// Cuándo se puede anular un cobro. La regla estaba escrita tres veces y de dos
/// maneras distintas (F5).
/// </summary>
public class PaymentVoidPolicyTests
{
    private static readonly DateTime Ahora = new(2026, 8, 27, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void DentroDelPlazo_SePuedeAnular()
        => PaymentVoidPolicy.CanVoid(false, Ahora.AddDays(-10), Ahora).Should().BeTrue();

    [Fact]
    public void JustoEnElUltimoDia_TodaviaSePuede()
        => PaymentVoidPolicy.CanVoid(false, Ahora.AddDays(-30), Ahora).Should().BeTrue();

    [Fact]
    public void PasadoElPlazo_YaNo()
        => PaymentVoidPolicy.CanVoid(false, Ahora.AddDays(-31), Ahora).Should().BeFalse();

    [Fact]
    public void UnCobroYaAnulado_NoSeVuelveAAnular()
    {
        // Ésta era la divergencia: la grilla de la ficha del cliente sí lo miraba,
        // la ficha del pago no. La misma pantalla ofrecía o escondía el botón
        // "Anular" según por dónde se llegara.
        PaymentVoidPolicy.CanVoid(true, Ahora.AddDays(-1), Ahora).Should().BeFalse();
    }

    [Fact]
    public void ElPlazoYElEstadoSonPreguntasDistintas()
    {
        // El backend distingue "fuera de plazo" de "ya estaba anulado" en su
        // mensaje de error, así que la regla expone las dos por separado.
        var anuladoYReciente = Ahora.AddDays(-1);

        PaymentVoidPolicy.IsWithinWindow(anuladoYReciente, Ahora).Should().BeTrue();
        PaymentVoidPolicy.CanVoid(true, anuladoYReciente, Ahora).Should().BeFalse();
    }

    [Fact]
    public void ElPlazoEsDeTreintaDias()
        => PaymentVoidPolicy.WindowDays.Should().Be(30);
}

/// <summary>
/// El semáforo de SLA. Los umbrales estaban sueltos en la consulta y la etiqueta
/// no coincidía con el reparto en listas (F5).
/// </summary>
public class SlaTrafficLightTests
{
    private static readonly DateTime Creado = new(2026, 8, 27, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Vence  = Creado.AddHours(10);

    // ── Porcentaje consumido ────────────────────────────────────────────────

    [Theory]
    [InlineData(0,  0)]
    [InlineData(5,  50)]
    [InlineData(10, 100)]
    [InlineData(15, 150)]   // pasado de largo
    public void ElPorcentajeSaleDeLoTranscurridoSobreElPlazo(int horas, int esperado)
        => SlaTrafficLight.PercentElapsed(Creado, Vence, Creado.AddHours(horas))
            .Should().Be(esperado);

    [Fact]
    public void SiElVencimientoNoEsPosteriorALaCreacion_SeCuentaComoVencido()
    {
        // No hay plazo que repartir; el 100 % es la lectura prudente.
        SlaTrafficLight.PercentElapsed(Creado, Creado, Creado).Should().Be(100);
        SlaTrafficLight.PercentElapsed(Creado, Creado.AddHours(-1), Creado).Should().Be(100);
    }

    // ── Tramos ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(0,   SlaLevel.Ok)]
    [InlineData(49,  SlaLevel.Ok)]
    [InlineData(50,  SlaLevel.Attention)]
    [InlineData(74,  SlaLevel.Attention)]
    [InlineData(75,  SlaLevel.Warning)]
    [InlineData(99,  SlaLevel.Warning)]
    [InlineData(100, SlaLevel.Breached)]
    [InlineData(300, SlaLevel.Breached)]
    public void CadaPorcentajeCaeEnSuTramo(int pct, SlaLevel esperado)
        => SlaTrafficLight.Level(pct).Should().Be(esperado);

    [Fact]
    public void LaEtiquetaYElTramoNoPuedenDiscrepar()
    {
        // Antes la etiqueta decía "Attention" para TODO lo que bajara de 75,
        // incluido un ticket al 10 % que luego se descartaba por no llegar a 50.
        // Ahora ambas salen del mismo nivel.
        SlaTrafficLight.Label(SlaTrafficLight.Level(100)).Should().Be("Breached");
        SlaTrafficLight.Label(SlaTrafficLight.Level(80)).Should().Be("Warning");
        SlaTrafficLight.Label(SlaTrafficLight.Level(60)).Should().Be("Attention");
    }

    [Fact]
    public void LosUmbralesSonLosQueEsperaLaPantalla()
    {
        SlaTrafficLight.BreachedAt.Should().Be(100);
        SlaTrafficLight.WarningAt.Should().Be(75);
        SlaTrafficLight.AttentionAt.Should().Be(50);
    }
}
