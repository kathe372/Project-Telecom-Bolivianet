using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Coverage.Queries;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Coverage;

[Route("api/coverage")]
[Authorize(Policy = "AllRolesOrBot")]
public class CoverageCheckController : BaseController
{
    private readonly IMediator _mediator;

    public CoverageCheckController(IMediator mediator) => _mediator = mediator;

    [HttpGet("check")]
    [Authorize(Policy = "AllRolesOrBot")]
    public async Task<IActionResult> Check(
        [FromQuery] double lat, [FromQuery] double lng,
        [FromQuery] string? channel = null,
        [FromQuery] string? contactPhone = null,
        [FromQuery] string? contactName = null)
    {
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
            return BadRequestResult("Coordenadas fuera de rango válido.");

        // PR-2: canal/contacto opcionales alimentan el log de demanda (heatmap de leads).
        var result = await _mediator.Send(new CheckCoverageQuery(lat, lng, channel, contactPhone, contactName));
        return result.IsSuccess
            ? OkResult(result.Value)
            : BadRequestResult(result.ErrorMessage);
    }

    // PR-4a: consulta por DIRECCIÓN de texto (geocodifica y delega en el check por GPS).
    // Útil para el chatbot cuando el cliente escribe su dirección en vez de mandar GPS.
    [HttpGet("check-address")]
    // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
    // ampliar el piso de la clase para admitir al bot, heredarla la
    // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> CheckByAddress(
        [FromQuery] string address,
        [FromQuery] string? channel = null,
        [FromQuery] string? contactPhone = null,
        [FromQuery] string? contactName = null)
    {
        if (string.IsNullOrWhiteSpace(address))
            return BadRequestResult("La dirección es requerida.");

        var result = await _mediator.Send(
            new CheckCoverageByAddressQuery(address, channel, contactPhone, contactName));
        return result.IsSuccess
            ? OkResult(result.Value)
            : BadRequestResult(result.ErrorMessage);
    }
}
