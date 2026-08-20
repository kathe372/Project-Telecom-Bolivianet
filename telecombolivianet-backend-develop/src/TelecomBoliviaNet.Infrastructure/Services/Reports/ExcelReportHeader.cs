using ClosedXML.Excel;
using TelecomBoliviaNet.Application.DTOs.Reports;

namespace TelecomBoliviaNet.Infrastructure.Services.Reports;

/// <summary>
/// Escribe en una hoja de Excel el mismo membrete que lleva el PDF: identidad de
/// la empresa, identificación del documento, metadatos y tarjetas de resumen.
///
/// Así un Excel exportado se puede imprimir o enviar por correo y sigue siendo un
/// documento de la empresa, no una tabla suelta sin contexto.
/// </summary>
internal static class ExcelReportHeader
{
    /// <summary>Pinta el encabezado y devuelve la primera fila libre para la tabla.</summary>
    public static int Write(
        IXLWorksheet ws,
        ReportContext ctx,
        int width,
        IReadOnlyList<ReportSummaryCard> cards)
    {
        var company = ctx.Company;
        var brand   = ReportTheme.SafeColor(company.PrimaryColor);

        var row = 1;

        row = Line(ws, row, width, company.Name,     16, XLColor.FromHtml(brand), bold: true);

        if (!string.IsNullOrWhiteSpace(company.Tagline))
            row = Line(ws, row, width, company.Tagline!, 9, XLColor.FromHtml(ReportTheme.Muted));

        var identity = string.Join("  ·  ", new[] { company.ContactLine, company.TaxLine }
            .Where(s => !string.IsNullOrWhiteSpace(s)));
        if (identity.Length > 0)
            row = Line(ws, row, width, identity, 8, XLColor.FromHtml(ReportTheme.Faint));

        row++;

        row = Line(ws, row, width, ctx.Title, 13, XLColor.FromHtml(ReportTheme.Ink), bold: true);

        var subtitle = string.Join("  ·  ", new[] { ctx.Subtitle, ctx.PeriodLabel }
            .Where(s => !string.IsNullOrWhiteSpace(s)));
        if (subtitle.Length > 0)
            row = Line(ws, row, width, subtitle, 10, XLColor.FromHtml(ReportTheme.Muted));

        row = Line(ws, row, width,
            $"Generado: {ctx.GeneratedAtText}  ·  Generado por: {ctx.GeneratedBy}  ·  " +
            $"Registros: {ctx.RecordCount:N0}",
            8, XLColor.FromHtml(ReportTheme.Faint));

        row = Line(ws, row, width, $"Filtros aplicados: {ctx.FiltersLine}",
            8, XLColor.FromHtml(ReportTheme.Faint));

        row++;
        row = WriteCards(ws, row, cards);

        return row + 1;
    }

    private static int Line(
        IXLWorksheet ws, int row, int width, string text,
        double fontSize, XLColor color, bool bold = false)
    {
        var cell = ws.Cell(row, 1);
        cell.Value                = text;
        cell.Style.Font.Bold      = bold;
        cell.Style.Font.FontSize  = fontSize;
        cell.Style.Font.FontColor = color;
        ws.Range(row, 1, row, width).Merge();
        return row + 1;
    }

    /// <summary>Cada tarjeta ocupa dos columnas: etiqueta arriba, valor grande abajo.</summary>
    private static int WriteCards(IXLWorksheet ws, int row, IReadOnlyList<ReportSummaryCard> cards)
    {
        if (cards.Count == 0) return row;

        for (var i = 0; i < cards.Count; i++)
        {
            var card = cards[i];
            var col  = i * 2 + 1;

            var label = ws.Cell(row, col);
            label.Value                = card.Label;
            label.Style.Font.FontSize  = 8;
            label.Style.Font.FontColor = XLColor.FromHtml(ReportTheme.Faint);

            var value = ws.Cell(row + 1, col);
            value.Value                = card.Value;
            value.Style.Font.Bold      = true;
            value.Style.Font.FontSize  = 11;
            value.Style.Font.FontColor = XLColor.FromHtml(card.ColorHex);

            if (!string.IsNullOrWhiteSpace(card.Caption))
            {
                var caption = ws.Cell(row + 2, col);
                caption.Value                = card.Caption;
                caption.Style.Font.FontSize  = 8;
                caption.Style.Font.FontColor = XLColor.FromHtml(ReportTheme.Muted);
            }
        }

        return row + 3;
    }

    /// <summary>Estilo compartido de la fila de cabecera de una tabla.</summary>
    public static void StyleTableHeader(IXLWorksheet ws, int row, string[] headers)
    {
        for (var c = 0; c < headers.Length; c++)
        {
            var cell = ws.Cell(row, c + 1);
            cell.Value                          = headers[c];
            cell.Style.Font.Bold                = true;
            cell.Style.Font.FontSize            = 9;
            cell.Style.Font.FontColor           = XLColor.White;
            cell.Style.Fill.BackgroundColor     = XLColor.FromHtml(ReportTheme.TableHeader);
            cell.Style.Alignment.Vertical       = XLAlignmentVerticalValues.Center;
            cell.Style.Alignment.Horizontal     = XLAlignmentHorizontalValues.Center;
            cell.Style.Alignment.WrapText       = true;
        }
        ws.Row(row).Height = 24;
    }
}
