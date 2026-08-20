using TelecomBoliviaNet.Domain.Entities.Clients;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.DTOs.Reports;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Utils;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Invoices;

[Route("api/invoices")]
public class InvoicesController : BaseController
{
    private readonly IBillingService        _billing;
    private readonly IInvoiceQueryService   _query;
    private readonly AuditService           _audit;
    private readonly IExportService         _export;
    private readonly ICompanyProfileService _company;

    public InvoicesController(
        IBillingService        billing,
        IInvoiceQueryService   query,
        AuditService           audit,
        IExportService         export,
        ICompanyProfileService company)
    {
        _billing = billing;
        _query   = query;
        _audit   = audit;
        _export  = export;
        _company = company;
    }

    [HttpGet("stats")]
    [Authorize(Policy = "AdminOnly")]
    /// <param name="type">Tipo de factura o "all"/omitido para todas (ver InvoiceFilterDto.Type).</param>
    public async Task<IActionResult> GetStats(
        [FromQuery] int year, [FromQuery] int month, [FromQuery] string? type = null)
    {
        if (year < 2024 || month < 1 || month > 12)
            return BadRequestResult("Año o mes inválido.");
        return OkResult(await _query.GetMonthStatsAsync(year, month, type));
    }

    [HttpGet("stats/range")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetStatsRange(
        [FromQuery] DateTime dateFrom,
        [FromQuery] DateTime dateTo,
        [FromQuery] string?  type = null)
    {
        if (dateFrom > dateTo)
            return BadRequestResult("La fecha de inicio debe ser anterior a la fecha de fin.");
        if ((dateTo - dateFrom).TotalDays > 366)
            return BadRequestResult("El rango no puede superar 366 días.");
        return OkResult(await _query.GetRangeStatsAsync(dateFrom, dateTo, type));
    }

    [HttpGet]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetAll([FromQuery] InvoiceFilterDto filter)
        => OkResult(await _query.GetPagedAsync(filter));

    [HttpGet("deudores")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetDebtors(
        [FromQuery] string?   search = null,
        [FromQuery] DateTime? from   = null,
        [FromQuery] DateTime? to     = null)
        => OkResult(await _query.GetDebtorsAsync(search, from, to));

    [HttpGet("annual-report")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetAnnualReport([FromQuery] AnnualReportFilterDto filter)
    {
        if (filter.Year < 2024)
            return BadRequestResult("Año inválido.");
        return OkResult(await _query.GetAnnualReportAsync(filter));
    }

    [HttpGet("billing-preview")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetBillingPreview([FromQuery] int year, [FromQuery] int month)
    {
        if (year < 2024 || month < 1 || month > 12)
            return BadRequestResult("Año o mes inválido.");
        return OkResult(await _billing.GetBillingPreviewAsync(year, month));
    }

    [HttpPost("generate")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GenerateManual([FromQuery] int year, [FromQuery] int month)
    {
        if (year < 2024 || month < 1 || month > 12)
            return BadRequestResult("Año o mes inválido.");
        var result = await _billing.GenerateMonthlyInvoicesAsync(
            year, month, CurrentUserId, CurrentUserName);
        return OkResult(result);
    }

    [HttpPost("mark-overdue")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> MarkOverdue()
    {
        var count = await _billing.MarkOverdueInvoicesAsync(CurrentUserId, CurrentUserName);
        return OkResult(new { MarkedOverdue = count });
    }

    [HttpGet("export/excel")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> ExportExcel([FromQuery] InvoiceExportQueryDto q)
        => ExportInvoices(q, ExportFormat.Excel);

    [HttpGet("export/pdf")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> ExportPdf([FromQuery] InvoiceExportQueryDto q)
        => ExportInvoices(q, ExportFormat.Pdf);

    private async Task<IActionResult> ExportInvoices(InvoiceExportQueryDto q, ExportFormat format)
    {
        if (q.Year < 2024 || q.Month < 1 || q.Month > 12)
            return BadRequestResult("Año o mes inválido.");

        var invoices = (await _query.GetAllForExportAsync(q.Year, q.Month, q.Type, q.Status, q.Search))
            .ToList();

        var context = ReportContext.Create(
            company:     await _company.GetAsync(),
            title:       "Reporte de Facturación",
            subtitle:    "Detalle de facturas emitidas y su estado de cobro",
            periodLabel: $"{MonthName(q.Month)} {q.Year}",
            filters:     BuildFilters(q),
            generatedBy: CurrentUserName,
            recordCount: invoices.Count);

        var (bytes, contentType, extension) = format == ExportFormat.Excel
            ? (_export.ExportInvoicesToExcel(invoices, context), ExcelContentType, "xlsx")
            : (_export.ExportInvoicesToPdf(invoices, context),   "application/pdf", "pdf");

        await _audit.LogAsync("Facturación", "INVOICE_EXPORT",
            $"Exportación {extension.ToUpperInvariant()} facturas {q.Month}/{q.Year} " +
            $"({invoices.Count} registros, filtros: {context.FiltersLine})",
            userId: CurrentUserId, userName: CurrentUserName, ip: ClientIp);

        return File(bytes, contentType, $"Facturas_{MonthName(q.Month)}_{q.Year}.{extension}");
    }

    [HttpGet("annual-report/export/excel")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> ExportAnnualExcel([FromQuery] AnnualReportFilterDto filter)
        => ExportAnnual(filter, ExportFormat.Excel);

    [HttpGet("annual-report/export/pdf")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> ExportAnnualPdf([FromQuery] AnnualReportFilterDto filter)
        => ExportAnnual(filter, ExportFormat.Pdf);

    /// <summary>
    /// El generador del reporte anual ya existía pero no estaba expuesto: el
    /// frontend armaba un CSV a mano en el navegador y el Excel/PDF del backend
    /// era código muerto.
    /// </summary>
    private async Task<IActionResult> ExportAnnual(AnnualReportFilterDto filter, ExportFormat format)
    {
        if (filter.Year < 2024) return BadRequestResult("Año inválido.");

        var rows   = (await _query.GetAnnualReportAsync(filter)).ToList();
        var report = new AnnualReportExportDto(filter.Year, rows.Select(ToExportRow).ToList());

        var context = ReportContext.Create(
            company:     await _company.GetAsync(),
            title:       "Reporte Anual de Pagos",
            subtitle:    "Estado de facturación mes a mes por cliente",
            periodLabel: filter.Year.ToString(),
            filters:     BuildAnnualFilters(filter),
            generatedBy: CurrentUserName,
            recordCount: rows.Count);

        var (bytes, contentType, extension) = format == ExportFormat.Excel
            ? (_export.ExportAnnualReportToExcel(report, context), ExcelContentType, "xlsx")
            : (_export.ExportAnnualReportToPdf(report, context),   "application/pdf", "pdf");

        await _audit.LogAsync("Facturación", "ANNUAL_REPORT_EXPORT",
            $"Exportación {extension.ToUpperInvariant()} reporte anual {filter.Year} " +
            $"({rows.Count} clientes)",
            userId: CurrentUserId, userName: CurrentUserName, ip: ClientIp);

        return File(bytes, contentType, $"ReporteAnual_{filter.Year}.{extension}");
    }

    private static AnnualReportExportRowDto ToExportRow(AnnualReportRowDto row) => new(
        row.TbnCode,
        row.ClientName,
        row.Zone,
        row.PlanName,
        row.Cells
            .Select(c => new AnnualReportExportCellDto(
                c.Status,
                c.Amount,
                c.PaidAt.HasValue ? BoliviaTime.ToLocal(c.PaidAt.Value).ToString("dd/MM/yyyy") : null,
                c.PaymentMethod))
            .ToList());

    private static IReadOnlyList<ReportFilter> BuildFilters(InvoiceExportQueryDto q)
    {
        var filters = new List<ReportFilter>();

        if (!string.IsNullOrWhiteSpace(q.Type) && q.Type != "all")
            filters.Add(new ReportFilter("Tipo", q.Type));
        if (!string.IsNullOrWhiteSpace(q.Status) && q.Status != "all")
            filters.Add(new ReportFilter("Estado", q.Status));
        if (!string.IsNullOrWhiteSpace(q.Search))
            filters.Add(new ReportFilter("Búsqueda", q.Search));

        return filters;
    }

    private static IReadOnlyList<ReportFilter> BuildAnnualFilters(AnnualReportFilterDto f)
    {
        var filters = new List<ReportFilter>();

        if (!string.IsNullOrWhiteSpace(f.Zone))       filters.Add(new ReportFilter("Zona", f.Zone));
        if (!string.IsNullOrWhiteSpace(f.DebtFilter)) filters.Add(new ReportFilter("Deuda", f.DebtFilter));
        if (!string.IsNullOrWhiteSpace(f.Search))     filters.Add(new ReportFilter("Búsqueda", f.Search));
        if (f.PlanId.HasValue)                        filters.Add(new ReportFilter("Plan", f.PlanId.Value.ToString()));

        return filters;
    }

    private enum ExportFormat { Excel, Pdf }

    private const string ExcelContentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";


    private static string MonthName(int m) => m switch
    {
        1 => "Enero", 2 => "Febrero", 3 => "Marzo", 4 => "Abril",
        5 => "Mayo",  6 => "Junio",   7 => "Julio",  8 => "Agosto",
        9 => "Septiembre", 10 => "Octubre", 11 => "Noviembre", 12 => "Diciembre",
        _ => m.ToString()
    };


    [HttpPut("{id:guid}/void")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> VoidInvoice(Guid id, [FromBody] VoidInvoiceDto dto)
    {
        var result = await _billing.VoidInvoiceAsync(
            id, dto.Justification, CurrentUserId, CurrentUserName, ClientIp);
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return OkMessage("Factura anulada correctamente.");
    }
}
