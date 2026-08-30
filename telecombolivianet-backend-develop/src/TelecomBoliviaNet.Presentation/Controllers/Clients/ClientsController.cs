using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Clients.Commands;
using TelecomBoliviaNet.Application.Clients.Queries;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Clients;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Clients;

[Route("api/clients")]
[Authorize(Policy = "AdminOrTecnicoOrBot")]
public class ClientsController : BaseController
{
    private readonly IMediator                       _mediator;
    private readonly IValidator<RegisterClientDto>   _registerVal;
    private readonly IValidator<UpdateClientDto>     _updateVal;
    private readonly IValidator<RegisterPaymentDto>  _paymentVal;
    private readonly IClientAttachmentService         _attSvc;
    private readonly IClientHistoryService          _histSvc;
    private readonly ICreditRefundService            _refundSvc;

    public ClientsController(
        IMediator                      mediator,
        IValidator<RegisterClientDto>  registerVal,
        IValidator<UpdateClientDto>    updateVal,
        IValidator<RegisterPaymentDto> paymentVal,
        IClientAttachmentService        attSvc,
        IClientHistoryService         histSvc,
        ICreditRefundService          refundSvc)
    {
        _mediator    = mediator;
        _registerVal = registerVal;
        _updateVal   = updateVal;
        _paymentVal  = paymentVal;
        _attSvc      = attSvc;
        _histSvc     = histSvc;
        _refundSvc   = refundSvc;
    }


    [HttpGet("next-tbn")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> PeekTbn()
    {
        var code = await _mediator.Send(new PeekTbnQuery());
        return OkResult(new { NextTbn = code });
    }


    [HttpGet("by-phone")]
    [Authorize(Policy = "AllRolesOrBot")]
    public async Task<IActionResult> GetByPhone([FromQuery] string phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
            return BadRequestResult("El parámetro 'phone' es obligatorio.");

        var dto = await _mediator.Send(new GetClientByPhoneQuery(phone));

        if (dto is null)
            return NotFoundResult("No se encontró un cliente con ese número de teléfono.");

        return OkResult(dto);
    }


    /// <summary>
    /// 2026-08-05: variante de by-phone que devuelve TODAS las cuentas que
    /// comparten ese teléfono (PhoneMain no es único — ej. dos familiares con
    /// contratos separados) — el bot la usa para detectar ambigüedad y
    /// preguntar con cuál cuenta continuar en vez de elegir una al azar.
    /// </summary>
    [HttpGet("by-phone-all")]
    [Authorize(Policy = "AllRolesOrBot")]
    public async Task<IActionResult> GetAllByPhone([FromQuery] string phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
            return BadRequestResult("El parámetro 'phone' es obligatorio.");

        var dtos = await _mediator.Send(new GetClientsByPhoneQuery(phone));
        return OkResult(dtos);
    }


    [HttpGet]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetAll([FromQuery] ClientFilterDto filter)
    {
        var result = await _mediator.Send(new GetClientsQuery(filter));
        return OkResult(result);
    }


    [HttpGet("{id:guid}")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var client = await _mediator.Send(new GetClientByIdQuery(id));
        if (client is null) return NotFoundResult("Cliente no encontrado.");
        return OkResult(client);
    }


    [HttpGet("{id:guid}/invoices")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetInvoices(Guid id, [FromQuery] int year = 0)
    {
        if (year == 0) year = DateTime.UtcNow.Year;
        var grid = await _mediator.Send(new GetClientInvoicesQuery(id, year));
        return OkResult(grid);
    }


    [HttpGet("{id:guid}/invoices/bot")]
    [Authorize(Policy = "AllRolesOrBot")]
    public async Task<IActionResult> GetInvoicesForBot(Guid id, [FromQuery] int year = 0)
    {
        if (year == 0) year = DateTime.UtcNow.Year;
        var grid = await _mediator.Send(new GetClientInvoicesQuery(id, year));

        var paidAtMap = grid.Payments
            .SelectMany(p => p.CoveredMonths
                .Select(month => new { Month = month, p.PaidAt }))
            .GroupBy(x => x.Month)
            .ToDictionary(g => g.Key, g => (DateTime?)g.First().PaidAt);

        // Snapshot de plan por factura, para que el bot pueda explicar
        // diferencias de monto por cambio de plan sin inventar una causa.
        // Consulta aparte (no toca GetClientInvoicesQuery, uso del panel admin).
        var planSnapshots = await _mediator.Send(
            new GetInvoicePlanSnapshotsQuery(grid.Invoices.Select(i => i.Id)));
        var planByInvoiceId = planSnapshots.ToDictionary(p => p.InvoiceId, p => p);

        var invoices = grid.Invoices.Select(i =>
        {
            var monthKey = i.Status == "Pagada" && i.Month >= 1 && i.Month <= 12
                ? $"{new System.Globalization.CultureInfo("es-BO").DateTimeFormat.GetMonthName(i.Month)} {i.Year}"
                : null;
            planByInvoiceId.TryGetValue(i.Id, out var planSnap);
            return new
            {
                Id         = i.Id,
                Month      = i.Month,
                Year       = i.Year,
                Amount     = i.Amount,
                AmountPaid = i.AmountPaid,
                DueDate    = i.DueDate,
                Status     = i.Status,
                PaidAt     = monthKey != null && paidAtMap.TryGetValue(monthKey, out var paid) ? paid : (DateTime?)null,
                Notes      = i.Notes,
                PlanName   = planSnap?.PlanName,
                PlanPrice  = planSnap?.PlanPrice,
            };
        });

        return OkResult(new { Invoices = invoices });
    }


    [HttpPost]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> Register([FromBody] RegisterClientDto dto)
    {
        var v = await _registerVal.ValidateAsync(dto);
        if (!v.IsValid)
            return BadRequest(new { success = false, errors = v.Errors.Select(e => e.ErrorMessage) });

        var result = await _mediator.Send(new RegisterClientCommand(dto, CurrentUserId, CurrentUserName, ClientIp));
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return StatusCode(201, new { success = true, data = result.Value });
    }


    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateClientDto dto)
    {
        var v = await _updateVal.ValidateAsync(dto);
        if (!v.IsValid)
            return BadRequest(new { success = false, errors = v.Errors.Select(e => e.ErrorMessage) });

        var result = await _mediator.Send(new UpdateClientCommand(id, dto, CurrentUserId, CurrentUserName, ClientIp));
        if (result.IsConflict) return ConflictResult(result.ErrorMessage);
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return OkMessage("Cliente actualizado correctamente.");
    }


    [HttpPut("{id:guid}/suspend")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Suspend(Guid id)
    {
        var result = await _mediator.Send(new SuspendClientCommand(id, CurrentUserId, CurrentUserName, ClientIp));
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return OkMessage("Servicio suspendido. Se notificó al cliente por WhatsApp.");
    }

    [HttpPut("{id:guid}/reactivate")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Reactivate(Guid id)
    {
        var result = await _mediator.Send(new ReactivateClientCommand(id, CurrentUserId, CurrentUserName, ClientIp));
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return OkMessage("Servicio reactivado correctamente.");
    }


    [HttpPut("{id:guid}/cancel")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Cancel(Guid id, [FromQuery] bool confirmed = false)
    {
        var result = await _mediator.Send(new CancelClientCommand(id, confirmed, CurrentUserId, CurrentUserName, ClientIp));

        if (!result.IsSuccess)
            return BadRequestResult(result.ErrorMessage);

        if (result.Value == "needs_confirmation")
            return StatusCode(409, new
            {
                success = false,
                message = "El cliente tiene deuda pendiente. Envía confirmed=true para dar de baja igualmente.",
                requiresConfirmation = true
            });

        var message = result.Value == "cancelled_with_ticket"
            ? "Cliente dado de baja. Se creó un ticket de recolección de equipo automáticamente."
            : "Cliente dado de baja correctamente.";

        return OkMessage(message);
    }


    [HttpPost("{id:guid}/payments")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> RegisterPayment(Guid id, [FromBody] RegisterPaymentDto dto)
    {
        if (dto.ClientId != id)
            return BadRequestResult("El ID del cliente no coincide.");

        var v = await _paymentVal.ValidateAsync(dto);
        if (!v.IsValid)
            return BadRequest(new { success = false, errors = v.Errors.Select(e => e.ErrorMessage) });

        var result = await _mediator.Send(new RegisterPaymentCommand(dto, CurrentUserId, CurrentUserName, ClientIp));
        if (!result.IsSuccess) return BadRequestResult(result.ErrorMessage);
        return OkMessage("Pago registrado correctamente. Se notificó al cliente por WhatsApp.");
    }


    [HttpPost("search")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> Search([FromBody] ClientSearchDto dto)
        => OkResult(await _mediator.Send(new SearchClientsQuery(dto)));


    [HttpGet("{id:guid}/attachments")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetAttachments(Guid id)
        => OkResult(await _attSvc.GetByClientAsync(id));

    [HttpPost("{id:guid}/attachments")]
    [Authorize(Policy = "AdminOrOperador")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadAttachment(
        Guid id,
        IFormFile file,
        [FromForm] string  tipoDoc     = "Otro",
        [FromForm] string? descripcion = null)
    {
        if (file is null || file.Length == 0)
            return BadRequestResult("No se recibió ningún archivo.");

        using var stream = file.OpenReadStream();
        var result = await _attSvc.UploadAsync(
            id, file.FileName, file.ContentType, file.Length, stream,
            tipoDoc, descripcion, CurrentUserId, CurrentUserName, ClientIp);

        return result.IsSuccess ? OkResult(result.Value) : BadRequestResult(result.ErrorMessage);
    }

    [HttpGet("{id:guid}/attachments/{attachId:guid}/download")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> DownloadAttachment(Guid id, Guid attachId)
    {
        var result = await _attSvc.DownloadAsync(attachId);
        if (!result.IsSuccess) return NotFoundResult(result.ErrorMessage);
        var (stream, contentType, fileName) = result.Value;
        return File(stream, contentType, fileName);
    }

    [HttpDelete("{id:guid}/attachments/{attachId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> DeleteAttachment(Guid id, Guid attachId)
    {
        var result = await _attSvc.DeleteAsync(attachId, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkMessage("Adjunto eliminado.") : BadRequestResult(result.ErrorMessage);
    }


    [HttpGet("{id:guid}/historial")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetHistorial(
        Guid      id,
        [FromQuery] int      page     = 1,
        [FromQuery] int      pageSize = 25,
        [FromQuery] string?  tipo     = null,
        [FromQuery] DateTime? desde   = null,
        [FromQuery] DateTime? hasta   = null)
    {
        var result = await _histSvc.GetHistorialAsync(id, page, pageSize, tipo, desde, hasta);
        return OkResult(result);
    }


    [HttpPost("{id:guid}/credit/reembolsar")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> RefundCredit(
        Guid id, [FromBody] TelecomBoliviaNet.Application.DTOs.Payments.RefundCreditDto dto)
    {
        var result = await _refundSvc.RefundCreditAsync(
            id, dto.Justificacion, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkMessage("Crédito reembolsado.") : BadRequestResult(result.ErrorMessage);
    }
}
