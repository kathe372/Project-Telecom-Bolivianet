using QuestPDF.Infrastructure;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.DTOs.Reports;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Infrastructure.Services.Reports;

namespace TelecomBoliviaNet.Infrastructure.Services;

/// <summary>
/// Punto de entrada de las exportaciones. Cada reporte vive en su propia clase
/// bajo <c>Services/Reports</c>; aquí solo se elige cuál construir.
///
/// Antes esta clase concentraba los cuatro reportes en 490 líneas con la paleta,
/// el membrete y el pie duplicados en cada uno: agregar un reporte nuevo obligaba
/// a copiar todo eso otra vez.
/// </summary>
public class ExportService : IExportService
{
    static ExportService()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public byte[] ExportInvoicesToExcel(
        IEnumerable<InvoiceLegacyListItemDto> invoices, ReportContext context)
        => new InvoiceExcelReport(invoices.ToList(), context).Generate();

    public byte[] ExportInvoicesToPdf(
        IEnumerable<InvoiceLegacyListItemDto> invoices, ReportContext context)
        => new InvoicePdfReport(invoices.ToList(), context).Generate();

    public byte[] ExportAnnualReportToExcel(AnnualReportExportDto report, ReportContext context)
        => new AnnualReportExcel(report, context).Generate();

    public byte[] ExportAnnualReportToPdf(AnnualReportExportDto report, ReportContext context)
        => new AnnualReportPdf(report, context).Generate();
}
