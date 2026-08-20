using ClosedXML.Excel;
using FluentAssertions;
using TelecomBoliviaNet.Application.DTOs.Admin;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.DTOs.Reports;
using TelecomBoliviaNet.Application.Utils;
using TelecomBoliviaNet.Infrastructure.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// Cubre las exportaciones de facturación, que hasta ahora no tenían ninguna prueba.
/// Además de comprobar que los documentos se generan, fija los dos invariantes que
/// antes se rompían: los totales del encabezado salen de las mismas filas que la
/// tabla, y los siete estados del dominio se contabilizan.
/// </summary>
public class ExportServiceTests
{
    private static readonly CompanyProfileDto Company = new(
        Name:         "TelecomBoliviaNet",
        LegalName:    "TelecomBoliviaNet S.R.L.",
        Nit:          "1234567890",
        Address:      "Av. Blanco Galindo Km 4",
        City:         "Cochabamba, Bolivia",
        Phone:        "71435981",
        Email:        "contacto@telecombolivianet.com",
        Website:      null,
        Tagline:      "Proveedor de Servicios de Internet",
        LogoBase64:   null,
        PrimaryColor: "#1D4ED8",
        FooterLegal:  "Documento generado automáticamente.");

    /// <summary>Una factura por cada estado del dominio, con montos distinguibles.</summary>
    private static List<InvoiceLegacyListItemDto> AllStatusRows() =>
    [
        Row("Pagada",             amount: 200m, paid: 200m, paidAt: new DateTime(2026, 7, 5, 12, 0, 0, DateTimeKind.Utc)),
        Row("ParcialmentePagada", amount: 200m, paid:  80m),
        Row("Pendiente",          amount: 150m, paid:   0m),
        Row("Emitida",            amount: 150m, paid:   0m),
        Row("Enviada",            amount: 150m, paid:  50m),
        Row("Vencida",            amount: 100m, paid:   0m, daysOverdue: 40),
        Row("Anulada",            amount: 999m, paid:   0m),
    ];

    private static InvoiceLegacyListItemDto Row(
        string status, decimal amount, decimal paid,
        DateTime? paidAt = null, int daysOverdue = 0) => new(
            Id:            Guid.NewGuid(),
            TbnCode:       $"TBN-{status[..3].ToUpperInvariant()}",
            ClientName:    $"Cliente {status}",
            PlanName:      "Plan 20 Mbps",
            Amount:        amount,
            Type:          "Mensualidad",
            Status:        status,
            Year:          2026,
            Month:         7,
            IssuedAt:      new DateTime(2026, 7, 1, 10, 0, 0, DateTimeKind.Utc),
            DueDate:       new DateTime(2026, 7, 15, 10, 0, 0, DateTimeKind.Utc),
            Notes:         null,
            PaymentId:     null,
            InvoiceNumber: $"F-{status[..3]}",
            Zone:          "Norte",
            AmountPaid:    paid,
            PaidAt:        paidAt,
            DaysOverdue:   daysOverdue);

    private static ReportContext Context(int recordCount) => ReportContext.Create(
        company:     Company,
        title:       "Reporte de Facturación",
        subtitle:    "Detalle de facturas emitidas y su estado de cobro",
        periodLabel: "Julio 2026",
        filters:     [new ReportFilter("Estado", "Todos")],
        generatedBy: "admin@micrm.com",
        recordCount: recordCount);


    [Fact]
    public void Resumen_contabiliza_los_siete_estados_del_dominio()
    {
        var rows = AllStatusRows();

        var summary = InvoiceReportSummary.From(rows);

        summary.Count.Should().Be(7);
        summary.Buckets.Should().HaveCount(7,
            "cada estado del dominio debe aparecer, no solo los cuatro que el reporte coloreaba");
    }

    [Fact]
    public void Cobrado_incluye_los_abonos_parciales_de_cualquier_estado()
    {
        var summary = InvoiceReportSummary.From(AllStatusRows());

        // 200 (Pagada) + 80 (Parcial) + 50 (Enviada con abono). La Anulada no aporta.
        summary.TotalCollected.Should().Be(330m);
    }

    [Fact]
    public void Pendiente_descuenta_lo_abonado_y_excluye_anuladas()
    {
        var summary = InvoiceReportSummary.From(AllStatusRows());

        // 120 (Parcial) + 150 (Pendiente) + 150 (Emitida) + 100 (Enviada) + 100 (Vencida)
        summary.TotalPending.Should().Be(620m);
    }

    [Fact]
    public void Totales_del_resumen_cuadran_con_la_suma_de_las_filas()
    {
        var rows    = AllStatusRows();
        var summary = InvoiceReportSummary.From(rows);

        summary.TotalBilled.Should().Be(rows.Sum(r => r.Amount),
            "el encabezado se deriva de las filas exportadas, no de una consulta aparte");
    }


    [Fact]
    public void Pdf_de_facturacion_se_genera_con_contenido()
    {
        var rows = AllStatusRows();

        var bytes = new ExportService().ExportInvoicesToPdf(rows, Context(rows.Count));

        bytes.Should().NotBeEmpty();
        System.Text.Encoding.ASCII.GetString(bytes, 0, 4).Should().Be("%PDF");
    }

    [Fact]
    public void Pdf_de_facturacion_no_falla_sin_filas()
    {
        var bytes = new ExportService().ExportInvoicesToPdf([], Context(0));

        bytes.Should().NotBeEmpty("un mes sin facturas debe producir un reporte vacío, no una excepción");
    }

    [Fact]
    public void Pdf_tolera_un_logo_corrupto_en_la_configuracion()
    {
        var context = Context(0) with
        {
            Company = Company with { LogoBase64 = "esto-no-es-base64!!" }
        };

        var act = () => new ExportService().ExportInvoicesToPdf([], context);

        act.Should().NotThrow("un perfil mal cargado no puede tumbar la exportación");
    }

    [Fact]
    public void Pdf_tolera_un_color_de_marca_invalido()
    {
        var context = Context(0) with { Company = Company with { PrimaryColor = "azulito" } };

        var act = () => new ExportService().ExportInvoicesToPdf([], context);

        act.Should().NotThrow();
    }


    [Fact]
    public void Excel_escribe_fechas_como_fecha_y_montos_como_numero()
    {
        var rows  = AllStatusRows();
        var bytes = new ExportService().ExportInvoicesToExcel(rows, Context(rows.Count));

        using var wb = new XLWorkbook(new MemoryStream(bytes));
        var ws = wb.Worksheet(1);

        var pagada = FindRow(ws, "TBN-PAG");

        ws.Cell(pagada, 8).Value.IsNumber.Should().BeTrue("el monto debe poder sumarse");
        ws.Cell(pagada, 12).Value.IsDateTime.Should().BeTrue("la emisión debe poder ordenarse y filtrarse");
        ws.Cell(pagada, 14).Value.IsDateTime.Should().BeTrue("la fecha de pago debe ser una fecha real");
    }

    [Fact]
    public void Excel_convierte_las_fechas_a_hora_boliviana()
    {
        // 05/07/2026 12:00 UTC es 05/07/2026 08:00 en Bolivia: mismo día.
        // La emisión (10:00 UTC) también. Lo que se comprueba es que la celda
        // lleva la hora local, no el UTC crudo que escribía la versión anterior.
        var rows  = AllStatusRows();
        var bytes = new ExportService().ExportInvoicesToExcel(rows, Context(rows.Count));

        using var wb = new XLWorkbook(new MemoryStream(bytes));
        var ws  = wb.Worksheet(1);
        var fila = FindRow(ws, "TBN-PAG");

        ws.Cell(fila, 14).Value.GetDateTime()
            .Should().Be(BoliviaTime.ToLocal(new DateTime(2026, 7, 5, 12, 0, 0, DateTimeKind.Utc)));
    }

    [Fact]
    public void Excel_lleva_el_membrete_de_la_empresa()
    {
        var bytes = new ExportService().ExportInvoicesToExcel(AllStatusRows(), Context(7));

        using var wb = new XLWorkbook(new MemoryStream(bytes));
        var ws   = wb.Worksheet(1);
        var head = string.Join("\n", Enumerable.Range(1, 10).Select(r => ws.Cell(r, 1).GetString()));

        head.Should().Contain("TelecomBoliviaNet");
        head.Should().Contain("NIT: 1234567890");
        head.Should().Contain("Reporte de Facturación");
        head.Should().Contain("admin@micrm.com", "el reporte debe decir quién lo generó");
    }

    [Fact]
    public void Excel_deja_la_hoja_lista_para_trabajar()
    {
        var bytes = new ExportService().ExportInvoicesToExcel(AllStatusRows(), Context(7));

        using var wb = new XLWorkbook(new MemoryStream(bytes));
        var ws = wb.Worksheet(1);

        ws.AutoFilter.IsEnabled.Should().BeTrue("el usuario filtra la tabla en Excel");
        ws.SheetView.SplitRow.Should().BeGreaterThan(0, "la cabecera queda congelada al desplazarse");
    }

    [Fact]
    public void Excel_totaliza_con_subtotal_para_respetar_el_filtro()
    {
        var bytes = new ExportService().ExportInvoicesToExcel(AllStatusRows(), Context(7));

        using var wb = new XLWorkbook(new MemoryStream(bytes));
        var ws = wb.Worksheet(1);

        var totalsRow = FindRowStartingWith(ws, 7, "TOTALES");
        ws.Cell(totalsRow, 8).FormulaA1.Should().StartWith("SUBTOTAL(109",
            "un total fijo mentiría en cuanto el usuario filtre la tabla");
    }


    [Fact]
    public void Reporte_anual_se_genera_en_pdf_y_excel()
    {
        var report = new AnnualReportExportDto(2026,
        [
            new AnnualReportExportRowDto("TBN-0001", "Ana Torres", "Norte", "Plan 20 Mbps",
            [
                new AnnualReportExportCellDto("NoAplica",  0m,   null,         null),
                new AnnualReportExportCellDto("Pagada",    150m, "10/01/2026", "Efectivo"),
                new AnnualReportExportCellDto("Vencida",   150m, null,         null),
                new AnnualReportExportCellDto("ParcialmentePagada", 150m, null, null),
            ]),
        ]);

        var ctx = ReportContext.Create(Company, "Reporte Anual de Pagos",
            periodLabel: "2026", generatedBy: "admin", recordCount: 1);

        var svc = new ExportService();

        System.Text.Encoding.ASCII.GetString(svc.ExportAnnualReportToPdf(report, ctx), 0, 4)
            .Should().Be("%PDF");

        using var wb = new XLWorkbook(new MemoryStream(svc.ExportAnnualReportToExcel(report, ctx)));
        var ws = wb.Worksheet(1);

        var fila = FindRow(ws, "TBN-0001", column: 1);
        ws.Cell(fila, 18).Value.GetNumber().Should().Be(150d,
            "la última columna acumula lo efectivamente cobrado en el año");
    }


    /// <summary>En la hoja de facturación el código TBN es la columna 2; en la anual, la 1.</summary>
    private static int FindRow(IXLWorksheet ws, string tbnCode, int column = 2) =>
        ws.Column(column).CellsUsed(c => c.GetString() == tbnCode).First().Address.RowNumber;

    private static int FindRowStartingWith(IXLWorksheet ws, int column, string prefix) =>
        ws.Column(column).CellsUsed(c => c.GetString().StartsWith(prefix)).First().Address.RowNumber;
}
