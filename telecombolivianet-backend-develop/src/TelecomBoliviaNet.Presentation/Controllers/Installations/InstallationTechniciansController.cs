using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.DTOs.Installations;
using TelecomBoliviaNet.Application.Installations.Commands;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Installations;

[Route("api/instalaciones/{instalacionId:guid}/tecnicos")]
[Authorize(Policy = "AdminOrTecnico")]
public class InstallationTechniciansController : BaseController
{
    private readonly IMediator _mediator;

    public InstallationTechniciansController(IMediator mediator) => _mediator = mediator;

    [HttpPost]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> AssignTechnicians(
        Guid              instalacionId,
        [FromBody] AssignTechniciansDto dto)
    {
        if (dto.TecnicoIds.Count == 0)
            return BadRequestResult("Debe indicar al menos un técnico.");

        var actorId   = CurrentUserId;
        var actorName = CurrentUserName;
        var ip        = ClientIp;

        var result = await _mediator.Send(
            new AssignTechniciansCommand(instalacionId, dto, actorId, actorName, ip));

        return result.IsSuccess
            ? OkMessage("Técnicos asignados correctamente.")
            : BadRequestResult(result.ErrorMessage!);
    }
}
