using ClosedXML.Excel;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.DTOs.Reports;
using TelecomBoliviaNet.Application.Utils;

namespace TelecomBoliviaNet.Infrastructure.Services.Reports;

/// <summary>
/// Reporte de facturación en Excel.
///
/// A diferencia de la versión anterior, las fechas se escriben como fecha y los
/// montos como número (antes iban como texto, así que no se podían ordenar,
/// filtrar ni sumar), los totales son fórmulas <c>SUBTOTAL</c> que respetan el
/// autofiltro, y la hoja abre con la cabecera congelada y el filtro activo.
/// </summary>
internal sealed class InvoiceExcelReport
{
    private const string DateFormat  = "dd/mm/yyyy";
    private const string MoneyFormat = "#,##0.00";

    private static readonly string[] Headers =
    [
        "N° Factura", "Código TBN", "Cliente", "Zona", "Plan", "Tipo", "Estado",
        "Monto (Bs.)", "Cobrado (Bs.)", "Saldo (Bs.)", "Días Mora",
        "Emisión", "Vencimiento", "Fecha Pago", "Notas"
    ];

    private readonly IReadOnlyList<InvoiceLegacyListItemDto> _rows;
    private readonly ReportContext                           _ctx;
    private readonly InvoiceReportSummary                    _summary;

    public InvoiceExcelReport(IReadOnlyList<InvoiceLegacyListItemDto> rows, ReportContext ctx)
    {
        _rows    = rows;
        _ctx     = ctx;
        _summary = InvoiceReportSummary.From(rows);
    }

    public byte[] Generate()
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Facturación");

        var brand = ReportTheme.SafeColor(_ctx.Company.PrimaryColor);

        var headerRow = ExcelReportHeader.Write(
            ws, _ctx, Headers.Length, InvoiceReportCards.Build(_summary, brand));

        ExcelReportHeader.StyleTableHeader(ws, headerRow, Headers);

        var firstDataRow = headerRow + 1;
        var row          = headerRow;

        foreach (var inv in _rows)
        {
            row++;
            WriteInvoiceRow(ws, row, inv, brand, isAlt: (row - firstDataRow) % 2 == 1);
        }

        var lastDataRow = row;
        WriteTotalsRow(ws, row + 1, firstDataRow, lastDataRow, brand);

        Finish(ws, headerRow, lastDataRow);

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static void WriteInvoiceRow(
        IXLWorksheet ws, int row, InvoiceLegacyListItemDto inv, string brand, bool isAlt)
    {
        var collected = InvoiceReportSummary.CollectedOf(inv);
        var pending   = InvoiceReportSummary.PendingOf(inv);

        ws.Cell(row, 1).Value = inv.InvoiceNumber ?? "—";
        ws.Cell(row, 1).Style.Font.FontColor = XLColor.FromHtml(ReportTheme.Muted);

        ws.Cell(row, 2).Value = inv.TbnCode;
        ws.Cell(row, 2).Style.Font.Bold      = true;
        ws.Cell(row, 2).Style.Font.FontColor = XLColor.FromHtml(brand);

        ws.Cell(row, 3).Value = inv.ClientName;
        ws.Cell(row, 4).Value = inv.Zone;
        ws.Cell(row, 5).Value = inv.PlanName;
        ws.Cell(row, 6).Value = inv.Type;

        var status = ws.Cell(row, 7);
        status.Value                      = InvoiceStatusStyle.Label(inv.Status);
        status.Style.Font.Bold            = true;
        status.Style.Fill.BackgroundColor = XLColor.FromHtml(InvoiceStatusStyle.Background(inv.Status));
        status.Style.Font.FontColor       = XLColor.FromHtml(InvoiceStatusStyle.Foreground(inv.Status));

        Money(ws.Cell(row, 8),  inv.Amount, bold: true);
        Money(ws.Cell(row, 9),  collected, color: ReportTheme.Positive);
        Money(ws.Cell(row, 10), pending,   color: ReportTheme.Warning);

        // Una celda vacía no rompe la suma ni el orden; un "—" en columna numérica sí.
        if (inv.DaysOverdue > 0)
        {
            ws.Cell(row, 11).Value = inv.DaysOverdue;
            ws.Cell(row, 11).Style.Font.FontColor = XLColor.FromHtml(ReportTheme.Danger);
        }

        Date(ws.Cell(row, 12), inv.IssuedAt);
        Date(ws.Cell(row, 13), inv.DueDate);
        Date(ws.Cell(row, 14), inv.PaidAt, ReportTheme.Positive);

        ws.Cell(row, 15).Value = inv.Notes ?? string.Empty;
        ws.Cell(row, 15).Style.Font.FontColor = XLColor.FromHtml(ReportTheme.Muted);

        if (isAlt)
        {
            // La columna de estado conserva su propio color de fondo.
            ws.Range(row, 1, row, 6).Style.Fill.BackgroundColor  = XLColor.FromHtml(ReportTheme.ZebraRow);
            ws.Range(row, 8, row, 15).Style.Fill.BackgroundColor = XLColor.FromHtml(ReportTheme.ZebraRow);
        }

        ws.Range(row, 1, row, Headers.Length).Style.Border.BottomBorder      = XLBorderStyleValues.Thin;
        ws.Range(row, 1, row, Headers.Length).Style.Border.BottomBorderColor = XLColor.FromHtml(ReportTheme.Line);
    }

    /// <summary>
    /// Totales como <c>SUBTOTAL(109;…)</c>: al filtrar la tabla, los totales se
    /// recalculan sobre lo visible en lugar de mentir con el total completo.
    /// </summary>
    private void WriteTotalsRow(IXLWorksheet ws, int row, int firstDataRow, int lastDataRow, string brand)
    {
        var label = ws.Cell(row, 7);
        label.Value                = $"TOTALES ({_summary.Count})";
        label.Style.Font.Bold      = true;
        label.Style.Font.FontColor = XLColor.FromHtml(brand);
        label.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;

        if (lastDataRow >= firstDataRow)
        {
            foreach (var (col, color) in new[]
                     {
                         (8,  brand),
                         (9,  ReportTheme.Positive),
                         (10, ReportTheme.Warning),
                     })
            {
                var cell = ws.Cell(row, col);
                var range = $"{ws.Cell(firstDataRow, col).Address.ToStringRelative()}:" +
                            $"{ws.Cell(lastDataRow,  col).Address.ToStringRelative()}";
                cell.FormulaA1                  = $"SUBTOTAL(109,{range})";
                cell.Style.NumberFormat.Format  = MoneyFormat;
                cell.Style.Font.Bold            = true;
                cell.Style.Font.FontColor       = XLColor.FromHtml(color);
            }
        }

        var totalsRange = ws.Range(row, 1, row, Headers.Length);
        totalsRange.Style.Fill.BackgroundColor = XLColor.FromHtml(ReportTheme.Surface);
        totalsRange.Style.Border.TopBorder     = XLBorderStyleValues.Medium;
        totalsRange.Style.Border.TopBorderColor = XLColor.FromHtml(brand);
    }

    private void Finish(IXLWorksheet ws, int headerRow, int lastDataRow)
    {
        if (lastDataRow > headerRow)
            ws.Range(headerRow, 1, lastDataRow, Headers.Length).SetAutoFilter();

        // Congela todo el membrete y la cabecera: al bajar por 300 facturas se
        // sigue viendo de qué columna es cada número.
        ws.SheetView.FreezeRows(headerRow);

        ws.Columns().AdjustToContents();
        if (ws.Column(3).Width < 26) ws.Column(3).Width = 26;
        if (ws.Column(15).Width > 40) ws.Column(15).Width = 40;

        ws.PageSetup.PageOrientation = XLPageOrientation.Landscape;
        ws.PageSetup.SetRowsToRepeatAtTop(headerRow, headerRow);
    }

    private static void Money(IXLCell cell, decimal value, bool bold = false, string? color = null)
    {
        cell.Value                     = value;
        cell.Style.NumberFormat.Format = MoneyFormat;
        cell.Style.Font.Bold           = bold;
        if (color is not null) cell.Style.Font.FontColor = XLColor.FromHtml(color);
    }

    private static void Date(IXLCell cell, DateTime? utc, string? color = null)
    {
        if (!utc.HasValue) return;

        cell.Value                     = BoliviaTime.ToLocal(utc.Value);
        cell.Style.NumberFormat.Format = DateFormat;
        if (color is not null) cell.Style.Font.FontColor = XLColor.FromHtml(color);
    }
}
