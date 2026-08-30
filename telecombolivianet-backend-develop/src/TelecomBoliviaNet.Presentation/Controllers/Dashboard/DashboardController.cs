using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Dashboard.Queries;
using TelecomBoliviaNet.Application.DTOs.Dashboard;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Dashboard;

[Route("api/dashboard")]
[Authorize(Policy = "AllRoles")]
public class DashboardController : BaseController
{
    private readonly IMediator _mediator;
    public DashboardController(IMediator mediator) => _mediator = mediator;

    [HttpGet("kpis")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetKpis()
        => OkResult(await _mediator.Send(new GetDashKpisQuery()));

    [HttpGet("tendencia-cobros")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetTendencia([FromQuery] int meses = 6)
    {
        if (meses < 1 || meses > 24) return BadRequestResult("meses debe ser entre 1 y 24.");
        return OkResult(await _mediator.Send(new GetCollectionsTrendQuery(meses)));
    }

    [HttpGet("metodos-pago")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetMetodosPago()
        => OkResult(await _mediator.Send(new GetMetodosPagoQuery()));

    [HttpGet("tickets-estado")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetTicketsEstado()
        => OkResult(await _mediator.Send(new GetTicketsEstadoQuery()));

    [HttpGet("tickets-urgentes")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetTicketsUrgentes([FromQuery] int top = 8)
        => OkResult(await _mediator.Send(new GetTicketsUrgentesQuery(top)));

    [HttpGet("tickets-por-tipo")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetTicketsPorTipo()
        => OkResult(await _mediator.Send(new GetTicketsPorTipoQuery()));

    [HttpGet("resolucion-promedio")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetResolucionPromedio()
        => OkResult(await _mediator.Send(new GetResolucionPromedioQuery()));

    [HttpGet("whatsapp-actividad")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetWhatsAppActivity([FromQuery] int top = 10)
        => OkResult(await _mediator.Send(new GetWhatsAppActivityQuery(top)));

    [HttpGet("deudores")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetDebtors()
        => OkResult(await _mediator.Send(new GetDebtorsQuery()));

    [HttpGet("comprobantes-recientes")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetReceipts()
        => OkResult(await _mediator.Send(new GetRecentReceiptsQuery()));

    [HttpGet("clientes-por-zona")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetClientesPorZona()
        => OkResult(await _mediator.Send(new GetClientsByZoneQuery()));

    [HttpGet("actividad-horas")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetActivityHours()
        => OkResult(await _mediator.Send(new GetActivityHoursQuery()));

    [HttpGet("preferences/{userId:guid}")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetPreferences(Guid userId)
    {
        if (userId != CurrentUserId) return Forbid();
        return OkResult(await _mediator.Send(new GetDashPreferencesQuery(userId)));
    }

    [HttpPut("preferences/{userId:guid}")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> SavePreferences(Guid userId, [FromBody] DashboardPreferencesDto dto)
    {
        if (userId != CurrentUserId) return Forbid();
        var any = dto.ShowKpis || dto.ShowTendencia || dto.ShowTickets || dto.ShowWhatsApp ||
                  dto.ShowDeudores || dto.ShowZonas || dto.ShowMetodosPago || dto.ShowComprobantes;
        if (!any) return BadRequestResult("Debe mantener al menos una sección visible.");
        await _mediator.Send(new SaveDashPreferencesCommand(userId, dto));
        return OkMessage("Preferencias guardadas.");
    }

    [HttpGet("pagos")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetDashPagos()
        => OkResult(await _mediator.Send(new GetDashPagosQuery()));

    [HttpGet("tickets-metricas")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetTicketsMetricas()
        => OkResult(await _mediator.Send(new GetDashTicketsMetricasQuery()));

    [HttpGet("notif-stats")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetNotifStats()
        => OkResult(await _mediator.Send(new GetDashNotifQuery()));

    [HttpGet("chatbot-kpis")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetChatbotKpis()
        => OkResult(await _mediator.Send(new GetDashChatbotQuery()));

    [HttpGet("auto-actions")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetAutoActions()
        => OkResult(await _mediator.Send(new GetDashAutoActionsQuery()));


    [HttpGet("aging-cartera")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetAgingCartera()
        => OkResult(await _mediator.Send(new GetAgingPortfolioQuery()));

    [HttpGet("proximos-corte")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetProximosCorte([FromQuery] int dias = 7)
    {
        if (dias < 1 || dias > 30) return BadRequestResult("dias debe ser entre 1 y 30.");
        return OkResult(await _mediator.Send(new GetUpcomingCutoffsQuery(dias)));
    }

    [HttpGet("workload-tecnicos")]
        // F9 — Fijada explícitamente. Antes heredaba la de la clase; el
        // [Authorize] del método no la reemplaza, se exigen los dos (D-25),
        // así que ampliar el piso del controlador la abriría sin decidirlo.
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetTechniciansWorkload()
        => OkResult(await _mediator.Send(new GetTechniciansWorkloadQuery()));
}
