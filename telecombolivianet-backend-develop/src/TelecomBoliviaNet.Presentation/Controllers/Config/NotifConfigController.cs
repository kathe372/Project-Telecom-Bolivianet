using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.DTOs.Notifications;
using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Notifications;

namespace TelecomBoliviaNet.Presentation.Controllers.Config;

[Route("api/config/notifications")]
[Authorize(Policy = "AdminOnly")]
public class NotifConfigController : BaseController
{
    private readonly NotifConfigService _svc;
    private readonly NotifSendService  _envioSvc;

    public NotifConfigController(NotifConfigService svc, NotifSendService envioSvc)
    {
        _svc      = svc;
        _envioSvc = envioSvc;
    }


    [HttpGet]
    public async Task<IActionResult> GetConfigs()
        => OkResult(await _svc.GetConfigsAsync());

    [HttpPut]
    public async Task<IActionResult> UpdateConfigs([FromBody] UpdateNotifConfigsDto dto)
    {
        var suspConfig = dto.Configs.FirstOrDefault(c => c.Tipo == NotifType.SUSPENSION);
        if (suspConfig is { Activo: false })
        {
            if (!Request.Headers.TryGetValue("X-Confirm-Suspension", out var confirm)
                || confirm.ToString() != "true")
                return BadRequest(new { message = "La desactivación del trigger de Suspensión requiere confirmación. Envíe el header X-Confirm-Suspension: true." });
        }

        foreach (var upd in dto.Configs.Where(c => c.PlantillaId.HasValue))
        {
        }

        var result = await _svc.UpdateConfigsAsync(dto, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess
            ? OkMessage("Configuración actualizada correctamente.")
            : BadRequestResult(result.ErrorMessage);
    }


    [HttpGet("templates")]
    public async Task<IActionResult> GetPlantillas(
        [FromQuery] TemplateCategory? categoria = null,
        [FromQuery] HsmStatus? hsmStatus = null)
        => OkResult(await _svc.GetPlantillasAsync(categoria, hsmStatus));

    [HttpPut("templates/{tipo}")]
    public async Task<IActionResult> UpdatePlantilla(
        string tipo, [FromBody] UpdateNotifTemplateDto dto)
    {
        if (!Enum.TryParse<NotifType>(tipo, out var notifTipo))
            return BadRequestResult($"Tipo inválido: '{tipo}'.");

        if (dto.HsmStatus == HsmStatus.Rechazada)
        {
        }

        var result = await _svc.UpdatePlantillaAsync(
            notifTipo, dto, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess
            ? OkMessage("Plantilla actualizada correctamente.")
            : BadRequestResult(result.ErrorMessage);
    }

    [HttpPatch("templates/{tipo}/hsm")]
    public async Task<IActionResult> UpdateHsmStatus(string tipo, [FromBody] UpdateHsmStatusDto dto)
    {
        if (!Enum.TryParse<NotifType>(tipo, out var notifTipo))
            return BadRequestResult($"Tipo inválido: '{tipo}'.");

        var result = await _svc.UpdateHsmStatusAsync(
            notifTipo, dto.HsmStatus, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess
            ? OkMessage("Estado HSM actualizado.")
            : BadRequestResult(result.ErrorMessage);
    }

    [HttpPost("templates/{tipo}/restore")]
    public async Task<IActionResult> RestoreDefault(string tipo)
    {
        if (!Enum.TryParse<NotifType>(tipo, out var notifTipo))
            return BadRequestResult($"Tipo inválido: '{tipo}'.");

        var result = await _svc.RestoreDefaultAsync(
            notifTipo, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess
            ? OkMessage("Plantilla restaurada al texto por defecto.")
            : BadRequestResult(result.ErrorMessage);
    }


    [HttpGet("variables")]
    public IActionResult GetVariables()
        => OkResult(_svc.GetVariablesDisponibles()
            .Select(kv => new { Variable = kv.Key, Descripcion = kv.Value })
            .ToList());


    [HttpPost("templates/preview")]
    public async Task<IActionResult> PreviewPlantilla([FromBody] PreviewRequestDto dto)
        => OkResult(await _svc.PreviewPlantillaAsync(dto.Texto, dto.ClienteId));


    [HttpGet("segments")]
    public async Task<IActionResult> GetSegments()
        => OkResult(await _svc.GetSegmentsAsync());

    [HttpGet("segments/{id:guid}")]
    public async Task<IActionResult> GetSegmentById(Guid id)
    {
        var result = await _svc.GetSegmentByIdAsync(id);
        return result.IsSuccess ? OkResult(result.Value) : NotFoundResult(result.ErrorMessage);
    }

    [HttpPost("segments")]
    public async Task<IActionResult> CreateSegment([FromBody] CreateOrUpdateSegmentDto dto)
    {
        var result = await _svc.CreateSegmentAsync(dto, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkResult(result.Value) : BadRequestResult(result.ErrorMessage);
    }

    [HttpPut("segments/{id:guid}")]
    public async Task<IActionResult> UpdateSegment(Guid id, [FromBody] CreateOrUpdateSegmentDto dto)
    {
        var result = await _svc.UpdateSegmentAsync(id, dto, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkResult(result.Value) : BadRequestResult(result.ErrorMessage);
    }

    [HttpDelete("segments/{id:guid}")]
    public async Task<IActionResult> DeleteSegment(Guid id)
    {
        var result = await _svc.DeleteSegmentAsync(id, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkMessage("Segmento eliminado.") : BadRequestResult(result.ErrorMessage);
    }

    [HttpPost("segments/preview")]
    public async Task<IActionResult> PreviewSegment([FromBody] CreateOrUpdateSegmentDto dto)
        => OkResult(await _svc.PreviewSegmentAsync(dto));


    [HttpPost("send-masivo")]
    public async Task<IActionResult> BulkSend([FromBody] BulkSendDto dto)
    {
        var result = await _envioSvc.BulkSendAsync(dto, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkResult(result.Value) : BadRequestResult(result.ErrorMessage);
    }
}

public record PreviewRequestDto(string Texto, Guid? ClienteId);
