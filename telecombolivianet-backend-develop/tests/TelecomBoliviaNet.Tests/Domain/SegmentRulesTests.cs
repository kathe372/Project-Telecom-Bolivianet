using FluentAssertions;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// OBS-03 — Que una regla mal escrita lo diga al guardarla, no al no alcanzar a
/// nadie.
/// </summary>
public class SegmentRulesTests
{
    [Theory]
    [InlineData("zona",      "=",  "Norte")]
    [InlineData("zona",      "!=", "Sur")]
    [InlineData("plan",      "=",  "Plan Plata")]
    [InlineData("estado",    "=",  "Activo")]
    [InlineData("deuda",     ">",  "100")]
    [InlineData("deuda",     "<=", "0")]
    [InlineData("dias_mora", ">=", "30")]
    [InlineData("deuda",     "=",  "149.50")]
    public void UnaCondicionValida_NoTieneProblemas(string campo, string op, string valor)
        => SegmentRules.Problemas(campo, op, valor).Should().BeEmpty();

    [Fact]
    public void ComparaUnTextoConMayorQue_YSeLeDice()
    {
        // El caso exacto de OBS-03: se guardaba sin protestar y el envío salía a
        // cero personas.
        var problemas = SegmentRules.Problemas("zona", ">", "Norte");

        problemas.Should().ContainSingle();
        problemas[0].Should().Contain("zona").And.Contain("texto");
    }

    [Fact]
    public void ElOperadorTecleadoAlReves_TambienSeDetecta()
        => SegmentRules.Problemas("deuda", "=>", "100")
            .Should().ContainSingle().Which.Should().Contain("=>");

    [Fact]
    public void UnCampoQueNoExiste_SeDiceCualesSi()
    {
        var problemas = SegmentRules.Problemas("zzona", "=", "Norte");

        problemas.Should().ContainSingle();
        problemas[0].Should().Contain("zzona").And.Contain("zona").And.Contain("deuda");
    }

    [Fact]
    public void UnValorNoNumericoEnUnCampoNumerico_SeDetecta()
        => SegmentRules.Problemas("deuda", ">", "mucho")
            .Should().ContainSingle().Which.Should().Contain("mucho");

    [Fact]
    public void UnCampoInexistente_NoArrastraQuejasSobreElOperador()
    {
        // Sin saber de qué tipo es el campo, juzgar el operador sería inventar.
        // Un solo problema, el que se puede afirmar.
        SegmentRules.Problemas("inventado", ">", "x").Should().ContainSingle();
    }

    [Fact]
    public void ElCatalogoDeCamposCoincideConLoQueElEvaluadorSabeInterpretar()
    {
        // Los campos viven en dos sitios que no se pueden unificar: aquí como
        // catálogo, y en NotifShared.EvaluaCondicion como un switch sobre
        // entidades ya cargadas. Este test es lo que los mantiene de acuerdo: si
        // alguien añade un campo al switch y no aquí, seguirá siendo imposible
        // validarlo; si lo añade aquí y no al switch, el segmento se guardará y
        // no alcanzará a nadie — otra vez OBS-03.
        var delCatalogo = SegmentRules.CamposTexto
            .Concat(SegmentRules.CamposNumericos)
            .OrderBy(x => x);

        // Los que EvaluaCondicion trata explícitamente (su `_ => false` es el
        // resto). Escritos a mano a propósito: copiar la lista del catálogo
        // haría que el test se validara a sí mismo.
        var delEvaluador = new[] { "zona", "plan", "estado", "deuda", "dias_mora" }
            .OrderBy(x => x);

        delCatalogo.Should().BeEquivalentTo(delEvaluador);
    }
}
