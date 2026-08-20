using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.DTOs.Reports;
using TelecomBoliviaNet.Application.Utils;

namespace TelecomBoliviaNet.Infrastructure.Services.Reports;

/// <summary>Reporte de facturación en PDF: membrete de empresa, resumen y detalle.</summary>
internal sealed class InvoicePdfReport
{
    private readonly IReadOnlyList<InvoiceLegacyListItemDto> _rows;
    private readonly ReportContext                           _ctx;
    private readonly InvoiceReportSummary                    _summary;

    public InvoicePdfReport(IReadOnlyList<InvoiceLegacyListItemDto> rows, ReportContext ctx)
    {
        _rows    = rows;
        _ctx     = ctx;
        _summary = InvoiceReportSummary.From(rows);
    }

    public byte[] Generate() => Document.Create(container =>
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A4.Landscape());
            page.Margin(1.1f, Unit.Centimetre);
            page.DefaultTextStyle(s => s.FontSize(ReportTheme.FontBody).FontColor(ReportTheme.Ink));

            page.Header().Column(col =>
            {
                col.Item().Component(new ReportHeader(_ctx));

                // El resumen solo tiene sentido una vez; repetirlo en cada página
                // roba espacio a la tabla, que es lo que el usuario vino a leer.
                col.Item().ShowOnce().PaddingTop(8).Component(
                    new ReportSummaryCards(InvoiceReportCards.Build(_summary, Brand)));
            });

            page.Content().PaddingTop(8).Element(ComposeTable);

            page.Footer().Component(new ReportFooter(_ctx));
        });
    }).GeneratePdf();

    private string Brand => ReportTheme.SafeColor(_ctx.Company.PrimaryColor);

    private void ComposeTable(IContainer container)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(cols =>
            {
                cols.ConstantColumn(58);   // N° factura
                cols.ConstantColumn(52);   // Código TBN
                cols.RelativeColumn(2.4f); // Cliente
                cols.RelativeColumn(1.2f); // Zona
                cols.RelativeColumn(1.5f); // Plan
                cols.ConstantColumn(48);   // Tipo
                cols.ConstantColumn(52);   // Estado
                cols.ConstantColumn(56);   // Monto
                cols.ConstantColumn(56);   // Cobrado
                cols.ConstantColumn(52);   // Saldo
                cols.ConstantColumn(32);   // Mora
                cols.ConstantColumn(50);   // Emisión
                cols.ConstantColumn(50);   // Vencimiento
                cols.ConstantColumn(50);   // Fecha pago
            });

            table.Header(h =>
            {
                foreach (var (label, alignRight) in Headers)
                {
                    var cell = h.Cell()
                        .Background(ReportTheme.TableHeader)
                        .PaddingVertical(4).PaddingHorizontal(3);

                    (alignRight ? cell.AlignRight() : cell)
                        .Text(label).FontColor(ReportTheme.White)
                        .Bold().FontSize(ReportTheme.FontSmall);
                }
            });

            var isAlt = false;
            foreach (var inv in _rows)
            {
                var rowBg = isAlt ? ReportTheme.ZebraRow : ReportTheme.White;
                isAlt = !isAlt;

                IContainer Cell(string background = "") => table.Cell()
                    .Background(background.Length > 0 ? background : rowBg)
                    .BorderBottom(0.5f).BorderColor(ReportTheme.Line)
                    .PaddingVertical(3).PaddingHorizontal(3);

                var collected = InvoiceReportSummary.CollectedOf(inv);
                var pending   = InvoiceReportSummary.PendingOf(inv);

                Cell().Text(inv.InvoiceNumber ?? "—")
                    .FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Muted);

                Cell().Text(inv.TbnCode).FontSize(ReportTheme.FontSmall).Bold().FontColor(Brand);

                Cell().Text(inv.ClientName).FontSize(ReportTheme.FontSmall);

                Cell().Text(inv.Zone).FontSize(ReportTheme.FontSmall).FontColor(ReportTheme.Muted);

                Cell().Text(inv.PlanName).FontSize(ReportTheme.FontSmall).FontColor(ReportTheme.Muted);

                Cell().Text(inv.Type).FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Muted);

                Cell(InvoiceStatusStyle.Background(inv.Status))
                    .Text(InvoiceStatusStyle.Label(inv.Status))
                    .FontSize(ReportTheme.FontMicro).Bold()
                    .FontColor(InvoiceStatusStyle.Foreground(inv.Status));

                Cell().AlignRight().Text($"{inv.Amount:N2}")
                    .FontSize(ReportTheme.FontSmall).SemiBold();

                Cell().AlignRight().Text(collected > 0 ? $"{collected:N2}" : "—")
                    .FontSize(ReportTheme.FontSmall)
                    .FontColor(collected > 0 ? ReportTheme.Positive : ReportTheme.Faint);

                Cell().AlignRight().Text(pending > 0 ? $"{pending:N2}" : "—")
                    .FontSize(ReportTheme.FontSmall)
                    .FontColor(pending > 0 ? ReportTheme.Warning : ReportTheme.Faint);

                Cell().AlignRight().Text(inv.DaysOverdue > 0 ? $"{inv.DaysOverdue}" : "")
                    .FontSize(ReportTheme.FontMicro).Bold().FontColor(ReportTheme.Danger);

                Cell().Text(BoliviaTime.Date(inv.IssuedAt))
                    .FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Muted);

                Cell().Text(BoliviaTime.Date(inv.DueDate))
                    .FontSize(ReportTheme.FontMicro).FontColor(ReportTheme.Muted);

                Cell().Text(BoliviaTime.Date(inv.PaidAt))
                    .FontSize(ReportTheme.FontMicro)
                    .FontColor(inv.PaidAt.HasValue ? ReportTheme.Positive : ReportTheme.Faint);
            }

            ComposeTotalsRow(table);
        });
    }

    /// <summary>Fila de totales dentro de la tabla, no suelta debajo: se lee junto al detalle.</summary>
    private void ComposeTotalsRow(TableDescriptor table)
    {
        IContainer Total(bool alignRight = false)
        {
            var cell = table.Cell()
                .Background(ReportTheme.Surface)
                .BorderTop(1.2f).BorderColor(Brand)
                .PaddingVertical(4).PaddingHorizontal(3);
            return alignRight ? cell.AlignRight() : cell;
        }

        table.Cell().ColumnSpan(7)
            .Background(ReportTheme.Surface)
            .BorderTop(1.2f).BorderColor(Brand)
            .PaddingVertical(4).PaddingHorizontal(3)
            .AlignRight()
            .Text($"TOTALES — {_summary.Count} facturas")
            .Bold().FontSize(ReportTheme.FontSmall).FontColor(Brand);

        Total(alignRight: true).Text($"{_summary.TotalBilled:N2}")
            .Bold().FontSize(ReportTheme.FontSmall).FontColor(Brand);

        Total(alignRight: true).Text($"{_summary.TotalCollected:N2}")
            .Bold().FontSize(ReportTheme.FontSmall).FontColor(ReportTheme.Positive);

        Total(alignRight: true).Text($"{_summary.TotalPending:N2}")
            .Bold().FontSize(ReportTheme.FontSmall).FontColor(ReportTheme.Warning);

        for (var i = 0; i < 4; i++) Total().Text("");
    }

    private static readonly (string Label, bool AlignRight)[] Headers =
    [
        ("N° Factura", false), ("Código", false), ("Cliente", false), ("Zona", false),
        ("Plan", false), ("Tipo", false), ("Estado", false),
        ("Monto Bs.", true), ("Cobrado Bs.", true), ("Saldo Bs.", true), ("Mora", true),
        ("Emisión", false), ("Vencim.", false), ("Pago", false),
    ];
}
