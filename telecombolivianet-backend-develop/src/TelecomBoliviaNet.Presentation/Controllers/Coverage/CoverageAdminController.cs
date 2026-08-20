using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Coverage.Commands;
using TelecomBoliviaNet.Application.Coverage.Queries;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Coverage;

[Route("api/coverage")]
[Authorize(Policy = "AdminOnly")]
public class CoverageAdminController : BaseController
{
    private readonly IMediator _mediator;

    public CoverageAdminController(IMediator mediator) => _mediator = mediator;


    // AdminOrTecnico: el técnico necesita ver zonas/cajas en el mapa (solo
    // lectura) para evaluar instalaciones fuera de rango pero cerca de una
    // zona; crear/editar/eliminar zonas y cajas sigue siendo AdminOnly.
    [HttpGet("zones")]
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetZones([FromQuery] bool includeGeometry = false)
        => OkResult(await _mediator.Send(new GetCoverageZonesQuery(includeGeometry)));

    // PR-2: reporte de demanda (log de consultas). Filtro opcional por resultado
    // (p.ej. ?result=NO_COVERAGE para ver dónde hay clientes y no llegamos).
    [HttpGet("queries")]
    public async Task<IActionResult> GetQueries(
        [FromQuery] string? result = null, [FromQuery] int limit = 200)
        => OkResult(await _mediator.Send(new GetCoverageQueriesQuery(result, limit)));

    [HttpPost("zones")]
    public async Task<IActionResult> CreateZone([FromBody] CreateCoverageZoneRequest dto)
    {
        var result = await _mediator.Send(new CreateCoverageZoneCommand(dto, CurrentUserId));
        return result.IsSuccess
            ? StatusCode(201, new { success = true, data = result.Value })
            : BadRequestResult(result.ErrorMessage);
    }

    [HttpPut("zones/{id:guid}")]
    public async Task<IActionResult> UpdateZone(Guid id, [FromBody] UpdateCoverageZoneRequest dto)
    {
        var result = await _mediator.Send(new UpdateCoverageZoneCommand(id, dto));
        return result.IsSuccess ? OkResult(result.Value) : BadRequestResult(result.ErrorMessage);
    }

    [HttpDelete("zones/{id:guid}")]
    public async Task<IActionResult> DeleteZone(Guid id)
    {
        var result = await _mediator.Send(new DeleteCoverageZoneCommand(id));
        return result.IsSuccess ? OkMessage("Zona eliminada.") : BadRequestResult(result.ErrorMessage);
    }


    [HttpGet("zones/{zoneId:guid}/boxes")]
    public async Task<IActionResult> GetBoxesByZone(Guid zoneId)
        => OkResult(await _mediator.Send(new GetDistributionBoxesQuery(zoneId, null)));

    // Capa de "casas" del mapa: ubicaciones GPS de clientes con su caja NAP.
    [HttpGet("client-locations")]
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetClientLocations()
        => OkResult(await _mediator.Send(new GetClientLocationsQuery()));

    // AdminOrTecnico: los técnicos eligen la caja NAP al completar una instalación.
    [HttpGet("boxes")]
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetAllBoxes(
        [FromQuery] Guid? zoneId,
        [FromQuery] DistributionBoxStatus? status)
        => OkResult(await _mediator.Send(new GetDistributionBoxesQuery(zoneId, status)));

    [HttpPost("boxes")]
    public async Task<IActionResult> CreateBox([FromBody] CreateDistributionBoxRequest dto)
    {
        var result = await _mediator.Send(new CreateDistributionBoxCommand(dto));
        return result.IsSuccess
            ? StatusCode(201, new { success = true, data = result.Value })
            : BadRequestResult(result.ErrorMessage);
    }

    [HttpPut("boxes/{id:guid}")]
    public async Task<IActionResult> UpdateBox(Guid id, [FromBody] UpdateDistributionBoxRequest dto)
    {
        var result = await _mediator.Send(new UpdateDistributionBoxCommand(id, dto));
        return result.IsSuccess ? OkResult(result.Value) : BadRequestResult(result.ErrorMessage);
    }

    [HttpDelete("boxes/{id:guid}")]
    public async Task<IActionResult> DeleteBox(Guid id)
    {
        var result = await _mediator.Send(new DeleteDistributionBoxCommand(id));
        return result.IsSuccess ? OkMessage("Caja eliminada.") : BadRequestResult(result.ErrorMessage);
    }

    // PR-4b: puertos individuales de la caja (quién/ONU + estado) y su gestión.
    // Reconcilia el read-model al abrir la caja en el panel.
    [HttpGet("boxes/{boxId:guid}/ports")]
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetBoxPorts(Guid boxId)
        => OkResult(await _mediator.Send(new GetBoxPortsQuery(boxId)));

    [HttpPost("boxes/{boxId:guid}/ports/{numero:int}/damage")]
    public async Task<IActionResult> DamagePort(Guid boxId, int numero)
    {
        var result = await _mediator.Send(new MarkNapPortDamagedCommand(boxId, numero));
        return result.IsSuccess
            ? OkMessage("Puerto marcado como dañado.")
            : BadRequestResult(result.ErrorMessage);
    }

    [HttpPost("boxes/{boxId:guid}/ports/{numero:int}/repair")]
    public async Task<IActionResult> RepairPort(Guid boxId, int numero)
    {
        var result = await _mediator.Send(new RepairNapPortCommand(boxId, numero));
        return result.IsSuccess
            ? OkMessage("Puerto reparado.")
            : BadRequestResult(result.ErrorMessage);
    }
}
