using TelecomBoliviaNet.Application.DTOs.Reports;
using TelecomBoliviaNet.Application.Utils;

namespace TelecomBoliviaNet.Infrastructure.Services.Reports;

/// <summary>
/// Traduce el resumen de facturación a tarjetas. Compartido por el PDF y el Excel
/// para que ambos muestren exactamente los mismos números.
/// </summary>
internal static class InvoiceReportCards
{
    public static IReadOnlyList<ReportSummaryCard> Build(InvoiceReportSummary s, string brandColor)
    {
        var pagadas   = s.CountOf(InvoiceStatusStyle.Paid);
        var parciales = s.CountOf("ParcialmentePagada");
        var pendientes = s.CountOf("Pendiente", "Emitida", "Enviada");
        var vencidas  = s.CountOf("Vencida");
        var anuladas  = s.CountOf("Anulada");

        var cards = new List<ReportSummaryCard>
        {
            new("Total facturado", Money(s.TotalBilled),
                $"{s.Count} facturas", brandColor, Highlight: true),

            new("Total cobrado", Money(s.TotalCollected),
                Plural(pagadas, "pagada", "pagadas") +
                (parciales > 0 ? $" + {parciales} parcial{(parciales == 1 ? "" : "es")}" : ""),
                ReportTheme.Positive),

            new("Pendiente", Money(s.TotalPending),
                Plural(pendientes, "factura", "facturas"), ReportTheme.Warning),

            new("Vencido", Money(s.AmountOf("Vencida")),
                Plural(vencidas, "factura", "facturas"), ReportTheme.Danger),

            new("Tasa de cobranza", $"{s.CollectionRate:0.0}%",
                anuladas > 0 ? Plural(anuladas, "anulada", "anuladas") : "sobre lo facturado",
                ReportTheme.Accent),
        };

        return cards;
    }

    private static string Money(decimal value) => $"Bs. {value:N2}";

    private static string Plural(int count, string one, string many) =>
        $"{count} {(count == 1 ? one : many)}";
}
