namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Política de cambio de plan (2026-07-07), alineada con la práctica comercial
/// (Tigo/Entel/Comcast):
///  - <b>Upgrade</b> (plan más caro): puede aplicarse de inmediato con prorrata.
///  - <b>Downgrade</b> (plan de igual o menor precio): se aplica a <b>fin de mes</b>
///    (siguiente ciclo), evitando prorratas y reembolsos a mitad de ciclo.
/// </summary>
public static class PlanChangePolicy
{
    public static bool IsUpgrade(decimal oldPrice, decimal newPrice) => newPrice > oldPrice;

    /// <summary>¿Se permite aplicar el cambio de inmediato (mitad de mes)?</summary>
    public static bool AllowsImmediate(decimal oldPrice, decimal newPrice)
        => IsUpgrade(oldPrice, newPrice);

    /// <summary>Fecha efectiva del cambio, según se apruebe inmediato o a fin de mes.</summary>
    public static DateTime EffectiveDate(DateTime now, bool immediate)
        => immediate
            ? now
            : new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);
}
