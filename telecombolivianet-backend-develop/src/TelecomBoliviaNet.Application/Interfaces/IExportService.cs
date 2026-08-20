using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.DTOs.Reports;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Generación de documentos exportables.
///
/// Todas las firmas reciben un <see cref="ReportContext"/> en vez de estadísticas
/// precalculadas: los totales se derivan de las mismas filas que se exportan, de
/// modo que el encabezado nunca puede contradecir a la tabla.
/// </summary>
public interface IExportService
{
    byte[] ExportInvoicesToExcel(IEnumerable<InvoiceLegacyListItemDto> invoices, ReportContext context);

    byte[] ExportInvoicesToPdf(IEnumerable<InvoiceLegacyListItemDto> invoices, ReportContext context);

    byte[] ExportAnnualReportToExcel(AnnualReportExportDto report, ReportContext context);

    byte[] ExportAnnualReportToPdf(AnnualReportExportDto report, ReportContext context);
}
