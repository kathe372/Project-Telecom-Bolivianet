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
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetConfigs()
        => OkResult(await _svc.GetConfigsAsync());

    [HttpPut]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
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
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetPlantillas(
        [FromQuery] TemplateCategory? categoria = null,
        [FromQuery] HsmStatus? hsmStatus = null)
        => OkResult(await _svc.GetPlantillasAsync(categoria, hsmStatus));

    [HttpPut("templates/{tipo}")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
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
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
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
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
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
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public IActionResult GetVariables()
        => OkResult(_svc.GetVariablesDisponibles()
            .Select(kv => new { Variable = kv.Key, Descripcion = kv.Value })
            .ToList());


    [HttpPost("templates/preview")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> PreviewPlantilla([FromBody] PreviewRequestDto dto)
        => OkResult(await _svc.PreviewPlantillaAsync(dto.Texto, dto.ClienteId));


    [HttpGet("segments")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetSegments()
        => OkResult(await _svc.GetSegmentsAsync());

    [HttpGet("segments/{id:guid}")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetSegmentById(Guid id)
    {
        var result = await _svc.GetSegmentByIdAsync(id);
        return result.IsSuccess ? OkResult(result.Value) : NotFoundResult(result.ErrorMessage);
    }

    [HttpPost("segments")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> CreateSegment([FromBody] CreateOrUpdateSegmentDto dto)
    {
        var result = await _svc.CreateSegmentAsync(dto, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkResult(result.Value) : BadRequestResult(result.ErrorMessage);
    }

    [HttpPut("segments/{id:guid}")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateSegment(Guid id, [FromBody] CreateOrUpdateSegmentDto dto)
    {
        var result = await _svc.UpdateSegmentAsync(id, dto, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkResult(result.Value) : BadRequestResult(result.ErrorMessage);
    }

    [HttpDelete("segments/{id:guid}")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> DeleteSegment(Guid id)
    {
        var result = await _svc.DeleteSegmentAsync(id, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkMessage("Segmento eliminado.") : BadRequestResult(result.ErrorMessage);
    }

    [HttpPost("segments/preview")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> PreviewSegment([FromBody] CreateOrUpdateSegmentDto dto)
        => OkResult(await _svc.PreviewSegmentAsync(dto));


    [HttpPost("send-masivo")]
    // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
    // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
    // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> BulkSend([FromBody] BulkSendDto dto)
    {
        // Sin tipo no hay envío. Antes, un cuerpo vacío se enlazaba al primer
        // valor del enum (SUSPENSION) y, como SegmentId nulo significa «todos
        // los clientes activos», bastaba un POST con {} para anunciar a la
        // cartera entera que le habían suspendido el servicio. Se comprobó: el
        // endpoint respondía 200 y solo la ventana antispam frenó los envíos.
        if (dto?.Tipo is null)
            return BadRequestResult("Debe indicarse el tipo de notificación a enviar.");

        var result = await _envioSvc.BulkSendAsync(dto, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkResult(result.Value) : BadRequestResult(result.ErrorMessage);
    }
}

public record PreviewRequestDto(string Texto, Guid? ClienteId);
