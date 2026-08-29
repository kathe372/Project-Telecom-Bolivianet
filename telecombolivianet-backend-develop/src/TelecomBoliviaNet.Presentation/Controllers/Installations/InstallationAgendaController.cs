using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.Installations.Queries;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Installations;

[Route("api/instalaciones")]
[Authorize(Policy = "AdminOrTecnicoOrBot")]
public class InstallationAgendaController : BaseController
{
    private readonly IMediator _mediator;

    public InstallationAgendaController(IMediator mediator) => _mediator = mediator;

    [HttpGet("slots-disponibles")]
    [Authorize(Policy = "AllRolesOrBot")]
    public async Task<IActionResult> GetSlotsDisponibles(
        [FromQuery] int   dias   = 7,
        [FromQuery] Guid? planId = null)
    {
        if (dias < 1 || dias > 30)
            return BadRequestResult("El parámetro 'dias' debe estar entre 1 y 30.");

        var slots = await _mediator.Send(new GetInstallationSlotsQuery(dias, planId));
        return OkResult(slots);
    }

    [HttpGet("mi-agenda")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetMiAgenda([FromQuery] string fecha)
    {
        if (string.IsNullOrWhiteSpace(fecha))
            return BadRequestResult("El parámetro 'fecha' es obligatorio (YYYY-MM-DD).");

        var agenda = await _mediator.Send(new GetTechnicianAgendaQuery(CurrentUserId, fecha));
        return agenda is null
            ? NotFoundResult("Técnico no encontrado o fecha inválida.")
            : OkResult(agenda);
    }

    // Eventos del calendario en un rango de fechas (inclusive), opcionalmente por
    // técnico. Fechas mal formadas → 400 vía DomainException (GlobalExceptionHandler).
    // Un técnico solo ve su propia agenda: se fuerza tecnicoId a su propio id,
    // ignorando cualquier otro valor que mande en el query string.
    [HttpGet("calendario")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetCalendario(
        [FromQuery] string desde,
        [FromQuery] string hasta,
        [FromQuery] Guid?  tecnicoId = null)
    {
        if (string.IsNullOrWhiteSpace(desde) || string.IsNullOrWhiteSpace(hasta))
            return BadRequestResult("Los parámetros 'desde' y 'hasta' son obligatorios (YYYY-MM-DD).");

        if (CurrentUserRole == "Tecnico") tecnicoId = CurrentUserId;

        var eventos = await _mediator.Send(new GetCalendarEventsQuery(desde, hasta, tecnicoId));
        return OkResult(eventos);
    }

    // Visitas de tickets (soporte técnico, recolección de equipo, etc.) en el
    // mismo rango, para mostrarlas solo-lectura superpuestas al calendario de
    // instalaciones — no comparten acciones (completar/cancelar/asignar caja
    // son propias de instalaciones, no de tickets). Mismo criterio: un técnico
    // solo ve sus propias visitas.
    [HttpGet("calendario/visitas-tickets")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetCalendarioVisitasTickets(
        [FromQuery] string desde,
        [FromQuery] string hasta,
        [FromQuery] Guid?  tecnicoId = null)
    {
        if (string.IsNullOrWhiteSpace(desde) || string.IsNullOrWhiteSpace(hasta))
            return BadRequestResult("Los parámetros 'desde' y 'hasta' son obligatorios (YYYY-MM-DD).");

        if (CurrentUserRole == "Tecnico") tecnicoId = CurrentUserId;

        var visitas = await _mediator.Send(new GetTicketCalendarVisitsQuery(desde, hasta, tecnicoId));
        return OkResult(visitas);
    }
}
