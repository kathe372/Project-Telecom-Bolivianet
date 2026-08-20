using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using TelecomBoliviaNet.Application.DTOs.Reports;

namespace TelecomBoliviaNet.Infrastructure.Services.Reports;

/// <summary>Pie común: leyenda legal de la empresa a la izquierda, "Página X de Y" a la derecha.</summary>
internal sealed class ReportFooter : IComponent
{
    private readonly ReportContext _ctx;

    public ReportFooter(ReportContext ctx) => _ctx = ctx;

    public void Compose(IContainer container)
    {
        var company = _ctx.Company;

        var legend = string.Join("  ·  ", new[]
            {
                company.LegalName ?? company.Name,
                company.City,
                company.FooterLegal
            }
            .Where(s => !string.IsNullOrWhiteSpace(s)));

        container
            .BorderTop(1).BorderColor(ReportTheme.Line)
            .PaddingTop(5)
            .Row(row =>
            {
                row.RelativeItem().Text(legend)
                    .FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Faint);

                row.ConstantItem(110).AlignRight().Text(t =>
                {
                    t.DefaultTextStyle(s => s.FontSize(ReportTheme.FontMicro)
                                             .FontColor(ReportTheme.Faint));
                    t.Span("Página ");
                    t.CurrentPageNumber();
                    t.Span(" de ");
                    t.TotalPages();
                });
            });
    }
}
