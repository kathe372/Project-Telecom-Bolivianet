using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.DTOs.Reports;

namespace TelecomBoliviaNet.Infrastructure.Services.Reports;

/// <summary>
/// Matriz anual cliente × mes. Cada celda es un estado de factura; la última
/// columna acumula lo cobrado al cliente en el año.
/// </summary>
internal sealed class AnnualReportPdf
{
    private static readonly string[] ColumnLabels =
        ["Inst", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    private readonly AnnualReportExportDto _report;
    private readonly ReportContext         _ctx;

    public AnnualReportPdf(AnnualReportExportDto report, ReportContext ctx)
    {
        _report = report;
        _ctx    = ctx;
    }

    public byte[] Generate() => Document.Create(container =>
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A3.Landscape());
            page.Margin(1, Unit.Centimetre);
            page.DefaultTextStyle(s => s.FontSize(ReportTheme.FontSmall).FontColor(ReportTheme.Ink));

            page.Header().Column(col =>
            {
                col.Item().Component(new ReportHeader(_ctx));
                col.Item().ShowOnce().PaddingTop(6).Element(ComposeLegend);
            });

            page.Content().PaddingTop(6).Element(ComposeTable);

            page.Footer().Component(new ReportFooter(_ctx));
        });
    }).GeneratePdf();

    private string Brand => ReportTheme.SafeColor(_ctx.Company.PrimaryColor);

    /// <summary>
    /// Sin leyenda la matriz es ilegible: son iniciales de una letra sobre colores.
    /// </summary>
    private void ComposeLegend(IContainer container)
    {
        container.Row(row =>
        {
            row.AutoItem().Text("Referencia:")
                .FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Muted);

            foreach (var status in new[]
                     { "Pagada", "ParcialmentePagada", "Pendiente", "Vencida", "Anulada", "NoAplica" })
            {
                row.AutoItem().PaddingLeft(6)
                    .Background(InvoiceStatusStyle.Background(status))
                    .PaddingVertical(1).PaddingHorizontal(4)
                    .Text($"{CellText(status)} = {LegendLabel(status)}")
                    .FontSize(ReportTheme.FontMicro)
                    .FontColor(InvoiceStatusStyle.Foreground(status));
            }
        });
    }

    private void ComposeTable(IContainer container)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(cols =>
            {
                cols.ConstantColumn(52);   // TBN
                cols.RelativeColumn(2.4f); // Cliente
                cols.RelativeColumn(1.2f); // Zona
                cols.RelativeColumn(1.2f); // Plan
                foreach (var _ in ColumnLabels) cols.RelativeColumn(0.7f);
                cols.ConstantColumn(62);   // Cobrado en el año
            });

            table.Header(h =>
            {
                void Head(string label, bool center = false)
                {
                    var cell = h.Cell()
                        .Background(ReportTheme.TableHeader)
                        .PaddingVertical(3).PaddingHorizontal(2);
                    (center ? cell.AlignCenter() : cell)
                        .Text(label).FontColor(ReportTheme.White).Bold().FontSize(ReportTheme.FontMicro);
                }

                Head("TBN");
                Head("Cliente");
                Head("Zona");
                Head("Plan");
                foreach (var m in ColumnLabels) Head(m, center: true);
                Head("Cobrado Bs.", center: true);
            });

            var isAlt = false;
            foreach (var r in _report.Rows)
            {
                var rowBg = isAlt ? ReportTheme.ZebraRow : ReportTheme.White;
                isAlt = !isAlt;

                IContainer Cell(string background) => table.Cell()
                    .Background(background)
                    .BorderBottom(0.5f).BorderColor(ReportTheme.Line)
                    .PaddingVertical(2).PaddingHorizontal(2);

                Cell(rowBg).Text(r.TbnCode).Bold().FontColor(Brand).FontSize(ReportTheme.FontMicro);
                Cell(rowBg).Text(r.FullName).FontSize(ReportTheme.FontMicro);
                Cell(rowBg).Text(r.Zone).FontColor(ReportTheme.Muted).FontSize(ReportTheme.FontMicro);
                Cell(rowBg).Text(r.PlanName).FontColor(ReportTheme.Muted).FontSize(ReportTheme.FontMicro);

                foreach (var cell in r.Cells)
                    Cell(InvoiceStatusStyle.Background(cell.Status))
                        .AlignCenter()
                        .Text(CellText(cell.Status))
                        .FontSize(ReportTheme.FontMicro).Bold()
                        .FontColor(InvoiceStatusStyle.Foreground(cell.Status));

                Cell(rowBg).AlignRight()
                    .Text($"{CollectedInYear(r):N2}")
                    .SemiBold().FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Positive);
            }
        });
    }

    /// <summary>Lo efectivamente cobrado al cliente en el año, para cerrar la fila.</summary>
    internal static decimal CollectedInYear(AnnualReportExportRowDto row) =>
        row.Cells.Where(c => c.Status is "Pagada").Sum(c => c.Amount);

    internal static string CellText(string status) => status switch
    {
        "Pagada"             => "✓",
        "ParcialmentePagada" => "½",
        "Pendiente"          => "P",
        "Emitida"            => "E",
        "Enviada"            => "N",
        "Vencida"            => "V",
        "Anulada"            => "A",
        _                    => "—"
    };

    private static string LegendLabel(string status) => status switch
    {
        "ParcialmentePagada" => "Parcial",
        "NoAplica"           => "Sin factura",
        _                    => status
    };
}
