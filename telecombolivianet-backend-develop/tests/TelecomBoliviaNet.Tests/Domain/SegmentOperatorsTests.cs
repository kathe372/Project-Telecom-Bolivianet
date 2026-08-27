using FluentAssertions;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// Los operadores que deciden a qué clientes les llega un envío masivo eran dos
/// métodos privados sin ningún test (F5).
/// </summary>
public class SegmentOperatorsTests
{
    // ── Texto ───────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("Zona Norte", "=",  "Zona Norte", true)]
    [InlineData("Zona Norte", "=",  "zona norte", true)]   // no distingue mayúsculas
    [InlineData("Zona Norte", "=",  "Zona Sur",   false)]
    [InlineData("Zona Norte", "!=", "Zona Sur",   true)]
    [InlineData("Zona Norte", "!=", "Zona Norte", false)]
    [InlineData("",           "=",  "",           true)]
    public void CompararTexto(string actual, string op, string valor, bool esperado)
        => SegmentOperators.Compare(actual, op, valor).Should().Be(esperado);

    [Theory]
    [InlineData(">")]
    [InlineData("<")]
    [InlineData(">=")]
    [InlineData("<=")]
    [InlineData("contiene")]
    [InlineData("")]
    public void SobreTexto_UnOperadorNoAdmitido_NoAlcanzaANadie(string op)
    {
        // Esto es lo que hay que saber de este método: sobre texto SOLO valen
        // "=" y "!=". Un segmento con `zona > "Norte"` no alcanza a nadie y no
        // avisa de nada. Es seguro —mejor no escribirle a nadie que a todos— pero
        // silencioso, y quien construyó el segmento no tiene forma de saberlo.
        SegmentOperators.Compare("Zona Norte", op, "Zona Norte").Should().BeFalse();
        SegmentOperators.Compare("Zona Norte", op, "Otra").Should().BeFalse();
    }

    // ── Números ─────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(100, "=",  100, true)]
    [InlineData(100, "=",  150, false)]
    [InlineData(100, "!=", 150, true)]
    [InlineData(150, ">",  100, true)]
    [InlineData(100, ">",  100, false)]
    [InlineData(50,  "<",  100, true)]
    [InlineData(100, ">=", 100, true)]
    [InlineData(100, "<=", 100, true)]
    [InlineData(0,   ">",  0,   false)]
    public void CompararNumeros(decimal actual, string op, decimal valor, bool esperado)
        => SegmentOperators.Compare(actual, op, valor).Should().Be(esperado);

    [Theory]
    [InlineData("contiene")]
    [InlineData("=>")]      // el error de tecleo más probable
    [InlineData("")]
    public void SobreNumeros_UnOperadorNoAdmitido_NoAlcanzaANadie(string op)
        => SegmentOperators.Compare(100m, op, 50m).Should().BeFalse();

    // ── Qué operadores admite cada tipo de campo ────────────────────────────

    [Fact]
    public void LosCamposDeTextoAdmitenDosOperadores()
        => SegmentOperators.TextOperators.Should().Equal("=", "!=");

    [Fact]
    public void LosCamposNumericosAdmitenSeis()
        => SegmentOperators.NumberOperators.Should().Equal("=", "!=", ">", "<", ">=", "<=");

    [Theory]
    [InlineData("=",  false, true)]
    [InlineData(">",  false, false)]  // la asimetría, hecha consultable
    [InlineData(">",  true,  true)]
    [InlineData("^",  true,  false)]
    public void SeSabeDeAntemanoSiUnOperadorSirve(string op, bool numerico, bool admitido)
        => SegmentOperators.IsSupported(op, numerico).Should().Be(admitido);
}
