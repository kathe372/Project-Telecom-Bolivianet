using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using TelecomBoliviaNet.Application.DTOs.Reports;

namespace TelecomBoliviaNet.Infrastructure.Services.Reports;

/// <summary>
/// Membrete común a todos los reportes: identidad de la empresa a la izquierda,
/// identificación del documento a la derecha, y debajo la franja de metadatos
/// (período, filtros aplicados, registros, generado por).
///
/// Cada reporte que se agregue al sistema hereda este encabezado sin reescribirlo.
/// </summary>
internal sealed class ReportHeader : IComponent
{
    private readonly ReportContext _ctx;

    public ReportHeader(ReportContext ctx) => _ctx = ctx;

    public void Compose(IContainer container)
    {
        var company = _ctx.Company;
        var brand   = ReportTheme.SafeColor(company.PrimaryColor);

        container.Column(col =>
        {
            col.Item()
                .PaddingBottom(8)
                .BorderBottom(2).BorderColor(brand)
                .Row(row =>
                {
                    ComposeIdentity(row, brand);
                    ComposeDocumentInfo(row, brand);
                });

            col.Item().PaddingTop(8).Element(ComposeMetaStrip);
        });
    }

    private void ComposeIdentity(RowDescriptor row, string brand)
    {
        var company = _ctx.Company;
        var logo    = DecodeLogo(company.LogoBase64);

        if (logo is not null)
            row.ConstantItem(74).AlignMiddle().MaxHeight(38).Image(logo).FitArea();

        row.RelativeItem().PaddingLeft(logo is null ? 0 : 8).Column(inner =>
        {
            inner.Item().Text(company.Name)
                .Bold().FontSize(15).FontColor(brand);

            if (!string.IsNullOrWhiteSpace(company.Tagline))
                inner.Item().Text(company.Tagline)
                    .FontSize(ReportTheme.FontSmall).FontColor(ReportTheme.Muted);

            if (!string.IsNullOrWhiteSpace(company.ContactLine))
                inner.Item().PaddingTop(1).Text(company.ContactLine)
                    .FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Faint);

            if (!string.IsNullOrWhiteSpace(company.TaxLine))
                inner.Item().Text(company.TaxLine)
                    .FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Faint);
        });
    }

    private void ComposeDocumentInfo(RowDescriptor row, string brand)
    {
        row.ConstantItem(210).AlignRight().Column(inner =>
        {
            inner.Item().AlignRight().Text(_ctx.Title)
                .Bold().FontSize(12).FontColor(ReportTheme.Ink);

            if (!string.IsNullOrWhiteSpace(_ctx.Subtitle))
                inner.Item().AlignRight().Text(_ctx.Subtitle)
                    .FontSize(ReportTheme.FontSmall).FontColor(brand);

            if (!string.IsNullOrWhiteSpace(_ctx.PeriodLabel))
                inner.Item().AlignRight().Text($"Período: {_ctx.PeriodLabel}")
                    .FontSize(ReportTheme.FontSmall).FontColor(ReportTheme.Muted);

            inner.Item().AlignRight().Text($"Generado: {_ctx.GeneratedAtText}")
                .FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Faint);

            inner.Item().AlignRight().Text($"Generado por: {_ctx.GeneratedBy}")
                .FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Faint);
        });
    }

    private void ComposeMetaStrip(IContainer container)
    {
        var brand = ReportTheme.SafeColor(_ctx.Company.PrimaryColor);

        container
            .Background(ReportTheme.Surface)
            .BorderLeft(3).BorderColor(brand)
            .PaddingVertical(6).PaddingHorizontal(10)
            .Row(row =>
            {
                void Item(string label, string value, float weight)
                {
                    row.RelativeItem(weight).Column(c =>
                    {
                        c.Item().Text(label.ToUpperInvariant())
                            .FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Faint);
                        c.Item().Text(value)
                            .FontSize(ReportTheme.FontBody).SemiBold().FontColor(ReportTheme.Ink);
                    });
                }

                Item("Registros", $"{_ctx.RecordCount:N0}", 1f);
                Item("Filtros aplicados", _ctx.FiltersLine, 3f);
            });
    }

    /// <summary>
    /// El logo es un campo configurable: si viene con basura, el reporte sale sin
    /// logo en vez de reventar la exportación entera.
    /// </summary>
    private static byte[]? DecodeLogo(string? base64)
    {
        if (string.IsNullOrWhiteSpace(base64)) return null;

        // Tolera que lo hayan pegado como data URI desde el navegador.
        var payload = base64.Contains(",", StringComparison.Ordinal)
            ? base64[(base64.IndexOf(',') + 1)..]
            : base64;

        try   { return Convert.FromBase64String(payload); }
        catch (FormatException) { return null; }
    }
}
