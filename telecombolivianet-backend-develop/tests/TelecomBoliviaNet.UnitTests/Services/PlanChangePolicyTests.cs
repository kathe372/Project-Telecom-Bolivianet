using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.UnitTests.Services;

/// <summary>
/// Problema 7 — Política de cambio de plan: upgrade puede ser inmediato con prorrata;
/// downgrade (igual o menor precio) se aplica a fin de mes.
/// </summary>
public class PlanChangePolicyTests
{
    [Theory]
    [InlineData(100, 150, true)]   // upgrade → inmediato permitido
    [InlineData(150, 100, false)]  // downgrade → solo fin de mes
    [InlineData(100, 100, false)]  // mismo precio → no es upgrade
    public void AllowsImmediate_OnlyForUpgrades(int oldP, int newP, bool expected)
        => PlanChangePolicy.AllowsImmediate(oldP, newP).Should().Be(expected);

    [Fact]
    public void EffectiveDate_FinDeMes_IsFirstOfNextMonth()
    {
        var now = new DateTime(2026, 7, 20, 10, 0, 0, DateTimeKind.Utc);
        PlanChangePolicy.EffectiveDate(now, immediate: false)
            .Should().Be(new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void EffectiveDate_Immediate_IsNow()
    {
        var now = new DateTime(2026, 7, 20, 10, 0, 0, DateTimeKind.Utc);
        PlanChangePolicy.EffectiveDate(now, immediate: true).Should().Be(now);
    }
}
