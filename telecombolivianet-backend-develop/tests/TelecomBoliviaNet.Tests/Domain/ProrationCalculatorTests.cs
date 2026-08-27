using FluentAssertions;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// El prorrateo del primer mes vivía como método privado de <c>BillingService</c>,
/// donde solo se podía probar montando un servicio con ocho dependencias. Ahora es
/// dominio puro (F5) y se prueba con una tabla.
/// </summary>
public class ProrationCalculatorTests
{
    // ── El mes en que se instaló: se cobra a partir de ese día ──────────────

    [Theory]
    // Instalado el 15 de marzo: quedan 17 de 31 días → 100 × 17/31 = 54,84
    [InlineData(100, 2026, 3, 15, 54.84)]
    // Instalado el día 1: el mes entero
    [InlineData(100, 2026, 3, 1, 100.00)]
    // Instalado el último día de febrero: 1 de 28 días → 3,57
    [InlineData(100, 2026, 2, 28, 3.57)]
    // Precio real del plan más vendido, instalado a mitad de un mes de 30
    [InlineData(149, 2026, 4, 16, 74.50)]
    public void ElMesDeInstalacion_SeCobraSoloPorLosDiasRestantes(
        decimal precio, int anio, int mes, int dia, decimal esperado)
    {
        var (importe, _) = ProrationCalculator.FirstMonth(
            precio, new DateTime(anio, mes, dia), anio, mes);

        importe.Should().Be(esperado);
    }

    [Fact]
    public void ElMesDeInstalacion_ExplicaElProrrateoEnLaNota()
    {
        var (_, nota) = ProrationCalculator.FirstMonth(
            100m, new DateTime(2026, 3, 15), 2026, 3);

        nota.Should().Be("Mes proporcional: 17 de 31 días");
    }

    [Fact]
    public void ElDiaDeLaInstalacion_SeCobra()
    {
        // Instalado el último día del mes: se paga ese día, no cero.
        var (importe, _) = ProrationCalculator.FirstMonth(
            310m, new DateTime(2026, 1, 31), 2026, 1);

        importe.Should().Be(10m, "31 días de enero, queda 1 → 310 × 1/31");
    }

    // ── Cualquier otro mes: íntegro y sin nota ──────────────────────────────

    [Theory]
    [InlineData(2026, 4)]   // el mes siguiente
    [InlineData(2026, 12)]  // meses después
    [InlineData(2027, 3)]   // el mismo mes de otro año
    public void LosMesesPosteriores_SeCobranCompletos(int anio, int mes)
    {
        var (importe, nota) = ProrationCalculator.FirstMonth(
            149m, new DateTime(2026, 3, 15), anio, mes);

        importe.Should().Be(149m);
        nota.Should().BeNull("solo el mes de instalación lleva explicación");
    }

    [Fact]
    public void UnMesAnteriorALaInstalacion_TambienSeCobraCompleto()
    {
        // No debería facturarse, pero si alguien lo pide, la regla no inventa un
        // prorrateo negativo: devuelve la mensualidad.
        var (importe, nota) = ProrationCalculator.FirstMonth(
            149m, new DateTime(2026, 3, 15), 2026, 1);

        importe.Should().Be(149m);
        nota.Should().BeNull();
    }

    // ── Año bisiesto ────────────────────────────────────────────────────────

    [Fact]
    public void FebreroBisiesto_UsaLos29Dias()
    {
        var (importe, nota) = ProrationCalculator.FirstMonth(
            290m, new DateTime(2028, 2, 15), 2028, 2);

        importe.Should().Be(150m, "2028 es bisiesto: quedan 15 de 29 días");
        nota.Should().Be("Mes proporcional: 15 de 29 días");
    }

    [Fact]
    public void PrecioCero_NoRompeElCalculo()
    {
        var (importe, _) = ProrationCalculator.FirstMonth(
            0m, new DateTime(2026, 3, 15), 2026, 3);

        importe.Should().Be(0m);
    }
}
