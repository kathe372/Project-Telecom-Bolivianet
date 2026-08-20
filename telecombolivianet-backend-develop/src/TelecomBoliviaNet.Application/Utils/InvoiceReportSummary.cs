using TelecomBoliviaNet.Application.DTOs.Invoices;

namespace TelecomBoliviaNet.Application.Utils;

/// <summary>Cuántas facturas y cuánto dinero hay en un estado concreto.</summary>
public record InvoiceStatusBucket(string Status, int Count, decimal Amount);

/// <summary>
/// Resumen de una exportación de facturas, calculado <b>a partir de las filas que
/// realmente se exportan</b>.
///
/// Antes la cabecera del reporte venía de una consulta aparte
/// (<c>GetMonthStatsAsync</c>, que suma todos los tipos de factura) mientras la
/// tabla solo listaba mensualidades: el "Total facturado" del encabezado incluía
/// reconexiones e instalaciones que no aparecían en ninguna fila. Derivando el
/// resumen de las mismas filas, cabecera y detalle no pueden volver a divergir.
/// </summary>
public record InvoiceReportSummary(
    int     Count,
    decimal TotalBilled,
    decimal TotalCollected,
    decimal TotalPending,
    decimal CollectionRate,
    IReadOnlyList<InvoiceStatusBucket> Buckets)
{
    public static InvoiceReportSummary From(IReadOnlyCollection<InvoiceLegacyListItemDto> rows)
    {
        var billed    = rows.Sum(i => i.Amount);
        var collected = rows.Sum(CollectedOf);
        var pending   = rows.Sum(PendingOf);

        var buckets = rows
            .GroupBy(i => i.Status)
            .Select(g => new InvoiceStatusBucket(g.Key, g.Count(), g.Sum(i => i.Amount)))
            .OrderByDescending(b => b.Amount)
            .ToList();

        var rate = billed > 0 ? Math.Round(collected / billed * 100, 1) : 0m;

        return new InvoiceReportSummary(rows.Count, billed, collected, pending, rate, buckets);
    }

    /// <summary>
    /// Cuánto se cobró de esta factura. Una anulada no aporta nada; una pagada
    /// aporta su total; el resto —incluidas Emitida, Enviada y Vencida— aporta lo
    /// que tenga abonado, porque cualquiera de ellas admite pagos parciales.
    /// </summary>
    public static decimal CollectedOf(InvoiceLegacyListItemDto i) => i.Status switch
    {
        "Pagada"  => i.Amount,
        "Anulada" => 0m,
        _         => i.AmountPaid
    };

    /// <summary>Saldo que sigue por cobrar de esta factura.</summary>
    public static decimal PendingOf(InvoiceLegacyListItemDto i) => i.Status switch
    {
        "Pagada"  => 0m,
        "Anulada" => 0m,
        _         => Math.Max(0m, i.Amount - i.AmountPaid)
    };

    public int CountOf(params string[] statuses) =>
        Buckets.Where(b => statuses.Contains(b.Status)).Sum(b => b.Count);

    public decimal AmountOf(params string[] statuses) =>
        Buckets.Where(b => statuses.Contains(b.Status)).Sum(b => b.Amount);
}
