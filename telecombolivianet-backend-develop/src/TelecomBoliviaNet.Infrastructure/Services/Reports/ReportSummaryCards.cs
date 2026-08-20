using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using TelecomBoliviaNet.Application.DTOs.Reports;

namespace TelecomBoliviaNet.Infrastructure.Services.Reports;

/// <summary>
/// Franja de tarjetas de resumen: monto grande, etiqueta arriba y conteo abajo.
///
/// Es lo que permite leer el reporte de un vistazo sin sumar la tabla, y sirve
/// igual para facturación, cobranza o deudores — solo cambian las tarjetas.
/// </summary>
internal sealed class ReportSummaryCards : IComponent
{
    private readonly IReadOnlyList<ReportSummaryCard> _cards;

    public ReportSummaryCards(IReadOnlyList<ReportSummaryCard> cards) => _cards = cards;

    public void Compose(IContainer container)
    {
        if (_cards.Count == 0) return;

        container.Row(row =>
        {
            foreach (var card in _cards)
            {
                row.RelativeItem().PaddingRight(5).Element(cell =>
                {
                    cell = cell
                        .Border(0.6f)
                        .BorderColor(card.Highlight ? card.ColorHex : ReportTheme.LineStrong)
                        .Background(card.Highlight ? ReportTheme.Surface : ReportTheme.White)
                        .PaddingVertical(6).PaddingHorizontal(8);

                    cell.Column(c =>
                    {
                        c.Item().Text(card.Label.ToUpperInvariant())
                            .FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Faint);

                        c.Item().Text(card.Value)
                            .Bold().FontSize(11).FontColor(card.ColorHex);

                        if (!string.IsNullOrWhiteSpace(card.Caption))
                            c.Item().Text(card.Caption)
                                .FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Muted);
                    });
                });
            }
        });
    }
}
