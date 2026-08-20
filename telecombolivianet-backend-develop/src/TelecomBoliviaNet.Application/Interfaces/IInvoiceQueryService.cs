using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Application.DTOs.Invoices;

namespace TelecomBoliviaNet.Application.Interfaces;

public interface IInvoiceQueryService
{
    /// <param name="type">Tipo de factura (nombre de InvoiceType) o null/"all" para todas.</param>
    Task<InvoiceMonthStatsDto>             GetMonthStatsAsync(int year, int month, string? type = null);
    Task<InvoiceRangeStatsDto>             GetRangeStatsAsync(DateTime dateFrom, DateTime dateTo, string? type = null);
    Task<PagedResult<InvoiceDetailDto>>    GetPagedAsync(InvoiceFilterDto filter);
    Task<IEnumerable<AnnualReportRowDto>>  GetAnnualReportAsync(AnnualReportFilterDto filter);
    Task<IEnumerable<DebtorDto>>           GetDebtorsAsync(string? search = null, DateTime? from = null, DateTime? to = null);
    /// <summary>
    /// Filas de un período para exportar. Acepta los mismos filtros que la pantalla
    /// de Facturación para que el archivo descargado contenga lo que el usuario
    /// estaba viendo, no siempre el mes completo.
    /// </summary>
    Task<IEnumerable<InvoiceLegacyListItemDto>> GetAllForExportAsync(
        int year, int month, string? type = null, string? status = null, string? search = null);
}
