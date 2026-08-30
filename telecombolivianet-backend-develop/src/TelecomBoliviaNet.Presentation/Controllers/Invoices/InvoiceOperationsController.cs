using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Invoices;

[Route("api/invoices")]
[Authorize(Policy = "AdminOnly")]
public class InvoiceOperationsController : BaseController
{
    private readonly IInvoiceOperationsService    _operations;
    private readonly IExtraordinaryInvoiceService _extraordinary;
    private readonly IInvoiceCreditService        _credit;

    public InvoiceOperationsController(
        IInvoiceOperationsService    operations,
        IExtraordinaryInvoiceService extraordinary,
        IInvoiceCreditService        credit)
    {
        _operations    = operations;
        _extraordinary = extraordinary;
        _credit        = credit;
    }

    [HttpPost("extraordinary")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> CreateExtraordinary([FromBody] CreateExtraordinaryInvoiceDto dto)
    {
        var result = await _extraordinary.CreateExtraordinaryAsync(dto, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess
            ? StatusCode(201, new { success = true, data = result.Value })
            : BadRequestResult(result.ErrorMessage);
    }

    [HttpPatch("{id:guid}/estado")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> TransicionarEstado(Guid id, [FromBody] TransicionEstadoDto dto)
    {
        if (!Enum.TryParse<InvoiceStatus>(dto.NuevoEstado, out var estado))
            return BadRequestResult($"Estado inválido: {dto.NuevoEstado}.");

        var result = await _operations.TransicionarEstadoAsync(id, estado, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess
            ? OkMessage("Estado de factura actualizado.")
            : BadRequestResult(result.ErrorMessage);
    }

    [HttpPost("marcar-enviadas")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> MarkSent([FromBody] MarkSentDto dto)
    {
        var count = await _operations.MarkInvoicesSentAsync(dto.Year, dto.Month, CurrentUserId, CurrentUserName, ClientIp);
        return OkResult(new MarkSentResultDto(count, $"{dto.Month:D2}/{dto.Year}"));
    }

    [HttpPost("{id:guid}/aplicar-credito")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> ApplyCredit(Guid id)
    {
        var result = await _credit.ApplyCreditAsync(id, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess
            ? OkMessage("Crédito aplicado correctamente.")
            : BadRequestResult(result.ErrorMessage);
    }
}
