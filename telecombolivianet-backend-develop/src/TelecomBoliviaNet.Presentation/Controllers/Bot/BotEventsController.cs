using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TelecomBoliviaNet.Application.DTOs.Bot;
using TelecomBoliviaNet.Presentation.Controllers;
using TelecomBoliviaNet.Presentation.Hubs;

namespace TelecomBoliviaNet.Presentation.Controllers.Bot;


[Route("api/bot-events")]
[ApiController]
public class BotEventsController : BaseController
{
    private readonly IHubContext<AdminHub> _hub;
    private readonly ILogger<BotEventsController> _logger;

    public BotEventsController(
        IHubContext<AdminHub> hub,
        ILogger<BotEventsController> logger)
    {
        _hub    = hub;
        _logger = logger;
    }

    [HttpPost]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> ReceiveBotEvent([FromBody] BotEventDto dto)
    {
        if (dto is null)
            return BadRequestResult("El cuerpo del evento es requerido.");

        _logger.LogInformation(
            "BotEvent recibido: {Type} — {Phone} — {Client}",
            dto.EventType, dto.PhoneNumber, dto.ClientName ?? "—");

        var payload = new AdminBotEventPayload
        {
            EventType   = dto.EventType.ToString(),
            PhoneNumber = dto.PhoneNumber,
            ClientName  = dto.ClientName,
            TicketId    = dto.TicketId,
            Priority    = dto.Priority,
            Reason      = dto.Reason,
            Timestamp   = dto.Timestamp,
            ReceivedAt  = DateTimeOffset.UtcNow.ToString("O"),
        };

        await _hub.Clients.All.SendAsync("BotEvent", payload);

        _logger.LogInformation(
            "BotEvent reenviado vía SignalR: {Type}", dto.EventType);

        return OkMessage("Evento procesado y reenviado al panel.");
    }
}
