using TelecomBoliviaNet.Application.DTOs.Clients;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Clients;

[Route("api/plan-changes")]
[Authorize(Policy = "AdminOrTecnico")]
public class PlanChangeController : BaseController
{
    private readonly IPlanChangeService        _svc;
    private readonly IPlanChangeRequestService _requestSvc;
    private readonly IPlanChangeQueryService   _querySvc;

    public PlanChangeController(
        IPlanChangeService        svc,
        IPlanChangeRequestService requestSvc,
        IPlanChangeQueryService   querySvc)
    {
        _svc        = svc;
        _requestSvc = requestSvc;
        _querySvc   = querySvc;
    }

    [HttpGet("pending")]
    public async Task<IActionResult> GetPending([FromQuery] Guid? clientId = null)
        => OkResult(await _querySvc.GetPendingAsync(clientId));

    [HttpPost("/api/clients/{clientId:guid}/plan-change")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> RequestChange(
        Guid clientId,
        [FromBody] RequestChangeDto dto)
    {
        var result = await _requestSvc.RequestChangeAsync(
            clientId, dto.NewPlanId, dto.Notes,
            CurrentUserId, CurrentUserName, ClientIp);

        return result.IsSuccess
            ? StatusCode(201, new { success = true, data = new { ChangeId = result.Value } })
            : BadRequestResult(result.ErrorMessage!);
    }

    [HttpPatch("{id:guid}/approve")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Approve(Guid id, [FromQuery] bool midMonth = false)
    {
        var result = await _svc.ApproveChangeAsync(
            id, midMonth, CurrentUserId, CurrentUserName, ClientIp);

        return result.IsSuccess
            ? OkMessage(midMonth
                ? "Cambio de plan aplicado inmediatamente. Facturas proporcionales generadas."
                : "Cambio de plan aprobado. Se aplicará el 1ro del mes siguiente.")
            : BadRequestResult(result.ErrorMessage!);
    }

    [HttpPatch("{id:guid}/reject")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectChangeDto dto)
    {
        var result = await _svc.RejectChangeAsync(
            id, dto.Motivo, CurrentUserId, CurrentUserName, ClientIp);

        return result.IsSuccess
            ? OkMessage("Solicitud rechazada.")
            : BadRequestResult(result.ErrorMessage!);
    }

    [HttpGet("/api/clients/{clientId:guid}/plan-changes")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetHistorial(Guid clientId)
        => OkResult(await _querySvc.GetHistorialAsync(clientId));
}

