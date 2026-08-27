using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Payments;
using TelecomBoliviaNet.Application.Utils;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Payments;

[Route("api/payments")]
public class PaymentsController : BaseController
{
    private readonly IPaymentService          _svc;
    private readonly IPaymentQueryService     _querySvc;
    private readonly IPaymentReportService    _reportSvc;
    private readonly IOverdueReminderService  _reminderSvc;
    private readonly IPaymentCreditService    _creditSvc;
    private readonly ICashCloseService        _cashCloseSvc;
    private readonly IReceiptImageService     _receiptImageSvc;
    private readonly AuditService             _audit;

    public PaymentsController(
        IPaymentService         svc,
        IPaymentQueryService    querySvc,
        IPaymentReportService   reportSvc,
        IOverdueReminderService reminderSvc,
        IPaymentCreditService   creditSvc,
        ICashCloseService       cashCloseSvc,
        IReceiptImageService    receiptImageSvc,
        AuditService            audit)
    {
        _svc             = svc;
        _querySvc        = querySvc;
        _reportSvc       = reportSvc;
        _reminderSvc     = reminderSvc;
        _creditSvc       = creditSvc;
        _cashCloseSvc    = cashCloseSvc;
        _receiptImageSvc = receiptImageSvc;
        _audit           = audit;
    }

    [HttpGet]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetAll([FromQuery] PaymentFilterDto filter)
        => OkResult(await _querySvc.GetAllAsync(filter));

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var p = await _querySvc.GetByIdAsync(id);
        if (p is null) return NotFoundResult("Pago no encontrado.");
        return OkResult(p);
    }

    [HttpPost("{id:guid}/receipt-image")]
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> UploadReceiptImage(Guid id, IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequestResult("Debes adjuntar un archivo.");

        if (file.Length > 5 * 1024 * 1024)
            return BadRequestResult("El archivo no puede superar 5 MB.");

        var allowed = new[] { "image/jpeg", "image/png", "application/pdf" };
        if (!allowed.Contains(file.ContentType.ToLower()))
            return BadRequestResult("Formato no permitido. Use JPG, PNG o PDF.");

        using var stream = file.OpenReadStream();

        if (!await FileValidator.IsMagicBytesValidAsync(stream, file.ContentType))
            return BadRequestResult("El contenido del archivo no coincide con su extensión declarada.");

        var safeFileName = FileValidator.SanitizeFileName(file.FileName);
        var result = await _receiptImageSvc.AttachReceiptImageAsync(
            id, stream, safeFileName, file.ContentType,
            CurrentUserId, CurrentUserName, ClientIp);

        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return OkResult(new { Url = result.Value });
    }

    [HttpPut("{id:guid}/void")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> VoidPayment(Guid id, [FromBody] VoidPaymentDto dto)
    {
        var result = await _svc.VoidPaymentAsync(
            id, dto.Justification, CurrentUserId, CurrentUserName, ClientIp);

        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return OkResult(result.Value);
    }

    [HttpGet("collection-report")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> CollectionReport(
        [FromQuery] DateTime from, [FromQuery] DateTime to)
    {
        if (from > to)
            return BadRequestResult("La fecha de inicio no puede ser posterior a la fecha fin.");

        var report = await _reportSvc.GetCollectionReportAsync(from, to);
        return OkResult(report);
    }

    [HttpGet("check-duplicate")]
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> CheckDuplicate(
        [FromQuery] Guid clientId, [FromQuery] decimal amount, [FromQuery] DateTime paidAt)
    {
        var result = await _querySvc.CheckDuplicateAsync(clientId, amount, paidAt);
        return OkResult(result);
    }

    [HttpPost("send-reminders")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> SendReminders()
    {
        var result = await _reminderSvc.SendOverdueRemindersAsync(CurrentUserId, CurrentUserName);
        return OkResult(result);
    }

    [HttpPost("register-with-credit")]
    [Authorize(Policy = "AdminOrOperador")]
    public async Task<IActionResult> RegisterWithCredit([FromBody] RegisterPaymentDto dto)
    {
        var result = await _creditSvc.RegisterPaymentWithCreditAsync(
            dto, CurrentUserId, CurrentUserName, ClientIp);

        return result.IsSuccess ? OkResult(result.Value) : BadRequestResult(result.ErrorMessage);
    }

    [HttpGet("cash-close/active")]
    [Authorize(Policy = "AdminOrOperador")]
    public async Task<IActionResult> GetActiveTurno()
    {
        var dto = await _cashCloseSvc.GetOrCreateActiveTurnoAsync(CurrentUserId, CurrentUserName);
        return OkResult(dto);
    }

    [HttpPost("cash-close/close")]
    [Authorize(Policy = "AdminOrOperador")]
    public async Task<IActionResult> CerrarTurno()
    {
        var result = await _cashCloseSvc.CerrarTurnoAsync(CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkResult(result.Value) : BadRequestResult(result.ErrorMessage);
    }

    [HttpGet("cash-close")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetCashCloses(
        [FromQuery] Guid? operatorId,
        [FromQuery] DateTime? desde,
        [FromQuery] DateTime? hasta)
    {
        var list = await _cashCloseSvc.GetCashClosesAsync(operatorId, desde, hasta);
        return OkResult(list);
    }

    [HttpGet("{id:guid}/receipt")]
    [Authorize(Policy = "AdminOrOperador")]
    public async Task<IActionResult> DownloadReceipt(Guid id)
    {
        var receipt = await _creditSvc.GetReceiptByPaymentAsync(id);
        if (receipt is null) return NotFoundResult("Recibo no encontrado.");
        if (string.IsNullOrEmpty(receipt.PdfPath)) return NotFoundResult("El PDF aún no fue generado.");

        return OkResult(new { receipt.ReceiptNumber, receipt.PdfPath, receipt.GeneratedAt });
    }

    [HttpGet("report/by-operator")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetReportByOperator(
        [FromQuery] DateTime from,
        [FromQuery] DateTime to,
        [FromQuery] Guid? operatorId)
    {
        var result = await _reportSvc.GetCollectionByOperatorAsync(from, to, operatorId);
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return OkResult(result.Value);
    }

    [HttpGet("report/export-csv")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> ExportReportCsv(
        [FromQuery] DateTime from,
        [FromQuery] DateTime to,
        [FromQuery] Guid? operatorId)
    {
        var reportResult = await _reportSvc.GetCollectionByOperatorAsync(from, to, operatorId);
        if (!reportResult.IsSuccess) return BadRequestResult(reportResult.ErrorMessage);
        var report = reportResult.Value!;

        // La referencia bancaria es lo que permite conciliar contra el extracto del
        // banco; salía en el reporte de pantalla pero no en el archivo descargado.
        var csv = new CsvBuilder()
            .Row("Código", "Cliente", "Monto (Bs.)", "Método", "Banco", "Referencia",
                 "Fecha Pago", "Operador", "N° Recibo", "Origen");

        foreach (var p in report.Payments)
        {
            csv.Row(
                p.TbnCode,
                p.ClientName,
                CsvBuilder.Money(p.Amount),
                p.Method,
                p.Bank,
                p.BankReference,
                BoliviaTime.DateTimeText(p.PaidAt),
                p.OperatorName,
                p.PhysicalReceiptNumber,
                p.FromWhatsApp ? "WhatsApp" : "Manual");
        }

        csv.Row("", "TOTAL", CsvBuilder.Money(report.TotalAmount), "", "", "", "", "", "",
                $"{report.Count} pagos");

        // Exportar cobranza saca nombres y montos de clientes fuera del sistema:
        // queda registrado igual que la exportación de facturación.
        await _audit.LogAsync("Pagos", "PAYMENT_REPORT_EXPORT",
            $"Exportación CSV de cobranza {from:dd/MM/yyyy}–{to:dd/MM/yyyy} " +
            $"({report.Count} pagos, Bs. {report.TotalAmount:N2})",
            userId: CurrentUserId, userName: CurrentUserName, ip: ClientIp);

        return File(csv.ToBytes(), "text/csv; charset=utf-8",
            $"Cobranza_{from:yyyyMMdd}-{to:yyyyMMdd}.csv");
    }
}
