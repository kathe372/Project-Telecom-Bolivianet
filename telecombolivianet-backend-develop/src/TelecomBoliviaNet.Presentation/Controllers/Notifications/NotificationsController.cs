using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.DTOs.Notifications;
using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Notifications;

namespace TelecomBoliviaNet.Presentation.Controllers.Notifications;

[Route("api/notifications")]
[Authorize(Policy = "AdminOrTecnico")]
public class NotificationsController : BaseController
{
    private readonly NotifHistoryService          _historialSvc;
    private readonly NotifSendService              _envioSvc;
    private readonly ILogger<NotificationsController> _logger;

    public NotificationsController(
        NotifHistoryService            historialSvc,
        NotifSendService                envioSvc,
        ILogger<NotificationsController> logger)
    {
        _historialSvc = historialSvc;
        _envioSvc     = envioSvc;
        _logger       = logger;
    }

    [HttpPost("delivery-status")]
    [Authorize(Policy = "AllRoles")]
    public IActionResult ReceiveDeliveryStatus([FromBody] WhatsappDeliveryStatusDto dto)
    {
        if (dto is null || string.IsNullOrWhiteSpace(dto.WaMessageId))
            return BadRequestResult("WaMessageId es requerido.");

        _logger.LogInformation(
            "WhatsApp delivery status: wamid={WaMessageId} status={Status} ts={Timestamp}",
            dto.WaMessageId, dto.Status, dto.Timestamp);

        return OkMessage("Delivery status recibido.");
    }

    [HttpGet("/api/clients/{clientId:guid}/notifications")]
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetHistorialCliente(
        Guid     clientId,
        [FromQuery] int      page     = 1,
        [FromQuery] int      pageSize = 20,
        [FromQuery] string?  tipo     = null,
        [FromQuery] DateTime? desde   = null,
        [FromQuery] DateTime? hasta   = null)
    {
        var result = await _historialSvc.GetHistorialClienteAsync(
            clientId, page, pageSize, tipo, desde, hasta);
        return OkResult(result);
    }

    [HttpDelete("{notifId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> CancelNotif(Guid notifId)
    {
        var result = await _envioSvc.CancelNotifAsync(
            notifId, CurrentUserId, CurrentUserName, ClientIp);

        return result.IsSuccess
            ? OkMessage("Notificación cancelada correctamente.")
            : BadRequestResult(result.ErrorMessage);
    }

    [HttpDelete]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> CancelBulk(
        [FromQuery] string tipo,
        [FromQuery] string? razon = null)
    {
        if (!Enum.TryParse<NotifType>(tipo, out var notifTipo))
            return BadRequestResult($"Tipo de notificación inválido: '{tipo}'.");

        var result = await _envioSvc.CancelBulkAsync(
            notifTipo, razon, CurrentUserId, CurrentUserName, ClientIp);

        return result.IsSuccess
            ? OkResult(result.Value)
            : BadRequestResult(result.ErrorMessage);
    }
}
