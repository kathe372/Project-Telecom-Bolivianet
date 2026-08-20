using ClosedXML.Excel;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.DTOs.Reports;

namespace TelecomBoliviaNet.Infrastructure.Services.Reports;

/// <summary>Matriz anual cliente × mes en Excel, con el mismo membrete que el PDF.</summary>
internal sealed class AnnualReportExcel
{
    private static readonly string[] PeriodColumns =
        ["Instalación", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
         "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    private readonly AnnualReportExportDto _report;
    private readonly ReportContext         _ctx;

    public AnnualReportExcel(AnnualReportExportDto report, ReportContext ctx)
    {
        _report = report;
        _ctx    = ctx;
    }

    public byte[] Generate()
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add($"Anual {_report.Year}");

        var brand   = ReportTheme.SafeColor(_ctx.Company.PrimaryColor);
        string[] headers = ["TBN", "Cliente", "Zona", "Plan", .. PeriodColumns, "Cobrado (Bs.)"];

        var headerRow = ExcelReportHeader.Write(ws, _ctx, headers.Length, []);
        ExcelReportHeader.StyleTableHeader(ws, headerRow, headers);

        var row = headerRow;
        foreach (var clientRow in _report.Rows)
        {
            row++;
            ws.Cell(row, 1).Value = clientRow.TbnCode;
            ws.Cell(row, 1).Style.Font.Bold      = true;
            ws.Cell(row, 1).Style.Font.FontColor = XLColor.FromHtml(brand);

            ws.Cell(row, 2).Value = clientRow.FullName;
            ws.Cell(row, 3).Value = clientRow.Zone;
            ws.Cell(row, 4).Value = clientRow.PlanName;

            WritePeriodCells(ws, row, clientRow);

            var collected = ws.Cell(row, 5 + PeriodColumns.Length);
            collected.Value                     = AnnualReportPdf.CollectedInYear(clientRow);
            collected.Style.NumberFormat.Format = "#,##0.00";
            collected.Style.Font.Bold           = true;
            collected.Style.Font.FontColor      = XLColor.FromHtml(ReportTheme.Positive);
        }

        Finish(ws, headerRow, row, headers.Length);

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static void WritePeriodCells(IXLWorksheet ws, int row, AnnualReportExportRowDto clientRow)
    {
        for (var c = 0; c < clientRow.Cells.Count && c < PeriodColumns.Length; c++)
        {
            var cell   = clientRow.Cells[c];
            var xlCell = ws.Cell(row, 5 + c);

            // Estado + fecha de pago: la letra sola obliga a abrir otro reporte
            // para saber cuándo pagó el cliente.
            xlCell.Value = cell.Status switch
            {
                "Pagada"             => cell.PaidDate is not null ? $"✓ {cell.PaidDate}" : "✓ Pagada",
                "ParcialmentePagada" => "½ Parcial",
                "Pendiente"          => "Pendiente",
                "Emitida"            => "Emitida",
                "Enviada"            => "Enviada",
                "Vencida"            => "VENCIDA",
                "Anulada"            => "Anulada",
                _                    => "—"
            };

            xlCell.Style.Fill.BackgroundColor = XLColor.FromHtml(InvoiceStatusStyle.Background(cell.Status));
            xlCell.Style.Font.FontColor       = XLColor.FromHtml(InvoiceStatusStyle.Foreground(cell.Status));
            xlCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        }
    }

    private static void Finish(IXLWorksheet ws, int headerRow, int lastRow, int width)
    {
        if (lastRow > headerRow)
            ws.Range(headerRow, 1, lastRow, width).SetAutoFilter();

        // Las cuatro primeras columnas identifican al cliente: sin congelarlas,
        // al desplazarse hasta diciembre no se sabe de quién es la fila.
        ws.SheetView.Freeze(headerRow, 4);

        ws.Columns().AdjustToContents();
        if (ws.Column(2).Width < 26) ws.Column(2).Width = 26;

        ws.PageSetup.PageOrientation = XLPageOrientation.Landscape;
        ws.PageSetup.SetRowsToRepeatAtTop(headerRow, headerRow);
    }
}
