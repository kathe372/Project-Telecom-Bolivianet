using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Application.DTOs.Invoices;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>Los totales que encabezan la pantalla de Facturación.</summary>
public interface IInvoiceStatsService
{
    /// <param name="type">Tipo de factura (nombre de InvoiceType) o null/"all" para todas.</param>
    Task<InvoiceMonthStatsDto> GetMonthStatsAsync(int year, int month, string? type = null);

    Task<InvoiceRangeStatsDto> GetRangeStatsAsync(
        DateTime dateFrom, DateTime dateTo, string? type = null);
}

/// <summary>La grilla de Facturación.</summary>
public interface IInvoiceQueryService
{
    Task<PagedResult<InvoiceDetailDto>> GetPagedAsync(InvoiceFilterDto filter);
}

/// <summary>
/// Los informes de facturación: calendario anual, morosos y exportación.
/// </summary>
public interface IInvoiceReportService
{
    Task<IEnumerable<AnnualReportRowDto>> GetAnnualReportAsync(AnnualReportFilterDto filter);

    Task<IEnumerable<DebtorDto>> GetDebtorsAsync(
        string? search = null, DateTime? from = null, DateTime? to = null);

    /// <summary>
    /// Filas de un período para exportar. Acepta los mismos filtros que la pantalla
    /// de Facturación para que el archivo descargado contenga lo que el usuario
    /// estaba viendo, no siempre el mes completo.
    /// </summary>
    Task<IEnumerable<InvoiceLegacyListItemDto>> GetAllForExportAsync(
        int year, int month, string? type = null, string? status = null, string? search = null);
}
