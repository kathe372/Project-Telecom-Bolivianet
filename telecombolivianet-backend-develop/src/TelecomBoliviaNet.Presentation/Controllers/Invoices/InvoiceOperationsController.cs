using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Invoices;

[Route("api/invoices")]
[Authorize(Policy = "AdminOnly")]
public class InvoiceOperationsController : BaseController
{
    private readonly InvoiceOperationsService _operations;

    public InvoiceOperationsController(InvoiceOperationsService operations) => _operations = operations;

    [HttpPost("extraordinary")]
    public async Task<IActionResult> CreateExtraordinary([FromBody] CreateExtraordinaryInvoiceDto dto)
    {
        var result = await _operations.CreateExtraordinaryAsync(dto, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess
            ? StatusCode(201, new { success = true, data = result.Value })
            : BadRequestResult(result.ErrorMessage);
    }

    [HttpPatch("{id:guid}/estado")]
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
    public async Task<IActionResult> MarkSent([FromBody] MarkSentDto dto)
    {
        var count = await _operations.MarkInvoicesSentAsync(dto.Year, dto.Month, CurrentUserId, CurrentUserName, ClientIp);
        return OkResult(new MarkSentResultDto(count, $"{dto.Month:D2}/{dto.Year}"));
    }

    [HttpPost("{id:guid}/aplicar-credito")]
    public async Task<IActionResult> ApplyCredit(Guid id)
    {
        var result = await _operations.ApplyCreditAsync(id, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess
            ? OkMessage("Crédito aplicado correctamente.")
            : BadRequestResult(result.ErrorMessage);
    }
}
