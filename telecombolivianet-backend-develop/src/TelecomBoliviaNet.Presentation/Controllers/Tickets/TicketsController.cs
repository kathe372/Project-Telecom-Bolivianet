using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Services.Tickets;
using TelecomBoliviaNet.Application.Tickets.Commands;
using TelecomBoliviaNet.Application.Tickets.Queries;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Presentation.Controllers;

namespace TelecomBoliviaNet.Presentation.Controllers.Tickets;

[Route("api/tickets")]
[Authorize(Policy = "AdminOrTecnicoOrBot")]
public class TicketsController : BaseController
{
    private readonly IMediator                            _mediator;
    private readonly IValidator<CreateTicketDto>          _createVal;
    private readonly IValidator<UpdateTicketDto>          _updateVal;
    private readonly IValidator<ChangeTicketStatusDto>    _statusVal;
    private readonly IValidator<AssignTicketDto>          _assignVal;
    private readonly IValidator<AddCommentDto>            _commentVal;
    private readonly IValidator<AddWorkLogDto>            _workLogVal;
    private readonly IValidator<ScheduleVisitDto>         _visitVal;
    private readonly IValidator<RescheduleTicketVisitDto> _rescheduleVal;
    private readonly TicketBalancingService                _balanceoSvc;
    private readonly TicketAttachmentService              _attSvc;
    private readonly IConfiguration                       _config;

    public TicketsController(
        IMediator                         mediator,
        IValidator<CreateTicketDto>       createVal,
        IValidator<UpdateTicketDto>       updateVal,
        IValidator<ChangeTicketStatusDto> statusVal,
        IValidator<AssignTicketDto>       assignVal,
        IValidator<AddCommentDto>         commentVal,
        IValidator<AddWorkLogDto>         workLogVal,
        IValidator<ScheduleVisitDto>      visitVal,
        IValidator<RescheduleTicketVisitDto> rescheduleVal,
        TicketBalancingService             balanceoSvc,
        TicketAttachmentService           attSvc,
        IConfiguration                    config)
    {
        _mediator      = mediator;
        _createVal     = createVal;
        _updateVal     = updateVal;
        _statusVal     = statusVal;
        _assignVal     = assignVal;
        _commentVal    = commentVal;
        _workLogVal    = workLogVal;
        _visitVal      = visitVal;
        _rescheduleVal = rescheduleVal;
        _balanceoSvc   = balanceoSvc;
        _attSvc        = attSvc;
        _config        = config;
    }

    // Un técnico solo puede actuar sobre tickets asignados a él — salvo la
    // cuenta de servicio del chatbot (mismo rol Tecnico, pero actúa en nombre
    // de clientes vía WhatsApp sobre cualquier ticket, no solo "los suyos").
    private async Task<bool> CanActOnTicketAsync(Guid ticketId)
    {
        if (CurrentUserRole != "Tecnico") return true;

        var botEmail = _config["SISTEMA_BOT_EMAIL"] ?? "bot@telecombolivianet.bo";
        if (string.Equals(CurrentUserEmail, botEmail, StringComparison.OrdinalIgnoreCase))
            return true;

        var ownerId = await _mediator.Send(new GetTicketOwnerQuery(ticketId));
        return ownerId.HasValue && ownerId.Value == CurrentUserId;
    }

    // Un técnico solo debe ver los tickets asignados a él — se fuerza el filtro
    // por su propio id sin importar qué haya mandado el cliente, para que no
    // pueda ver la carga de trabajo de otros técnicos cambiando el query string.
    [HttpGet]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetAll([FromQuery] TicketFilterDto f)
    {
        if (CurrentUserRole == "Tecnico") f.AssignedToId = CurrentUserId;
        return OkResult(await _mediator.Send(new GetTicketsQuery(f)));
    }

    [HttpGet("{id:guid}")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var t = await _mediator.Send(new GetTicketByIdQuery(id));
        if (t is null) return NotFoundResult("Ticket no encontrado.");
        if (CurrentUserRole == "Tecnico" && t.AssignedToUserId != CurrentUserId)
            return NotFoundResult("Ticket no encontrado.");
        return OkResult(t);
    }

    [HttpGet("kanban")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetKanban([FromQuery] TicketFilterDto f)
    {
        if (CurrentUserRole == "Tecnico") f.AssignedToId = CurrentUserId;
        return OkResult(await _mediator.Send(new GetTicketKanbanQuery(f)));
    }

    [HttpGet("kpi")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetKpi(
        [FromQuery] DateTime? desde = null, [FromQuery] DateTime? hasta = null, [FromQuery] string? tecnico = null)
        => OkResult(await _mediator.Send(new GetTicketKpiQuery(desde, hasta, tecnico)));

    [HttpGet("overdue-sla")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetOverdueSla()
        => OkResult(await _mediator.Send(new GetOverdueSlaQuery()));

    [HttpGet("sla-alerts")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetSlaAlerts()
        => OkResult(await _mediator.Send(new GetSlaAlertsQuery()));

    [HttpGet("by-client/{clientId:guid}")]
    [Authorize(Policy = "AdminOrTecnicoOrBot")]
    public async Task<IActionResult> GetByClient(Guid clientId)
        => OkResult(await _mediator.Send(new GetTicketsByClientQuery(clientId)));

    // Conteo de tickets previos del mismo tipo, dentro de una
    // ventana de días — usado por el chatbot para detectar reclamos recurrentes.
    [HttpGet("by-client/{clientId:guid}/recent-count")]
    [Authorize(Policy = "AdminOrTecnicoOrBot")]
    public async Task<IActionResult> GetRecentTicketCount(
        Guid clientId, [FromQuery] TicketType type, [FromQuery] int sinceDays = 0)
        => OkResult(await _mediator.Send(new CountRecentClientTicketsQuery(clientId, type, sinceDays)));

    [HttpPost]
    [Authorize(Policy = "AdminOrTecnicoOrBot")]
    public async Task<IActionResult> Create([FromBody] CreateTicketDto dto)
    {
        var v = await _createVal.ValidateAsync(dto);
        if (!v.IsValid) return BadRequestResult(string.Join(" ", v.Errors.Select(e => e.ErrorMessage)));
        var r = await _mediator.Send(new CreateTicketCommand(dto, CurrentUserId, CurrentUserName, ClientIp, UserAgent));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminOrTecnicoOrBot")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTicketDto dto)
    {
        if (!await CanActOnTicketAsync(id)) return NotFoundResult("Ticket no encontrado.");
        var v = await _updateVal.ValidateAsync(dto);
        if (!v.IsValid) return BadRequestResult(string.Join(" ", v.Errors.Select(e => e.ErrorMessage)));
        var r = await _mediator.Send(new UpdateTicketCommand(id, dto, CurrentUserId, CurrentUserName, ClientIp, UserAgent));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    [HttpPatch("{id:guid}/status")]
    [Authorize(Policy = "AdminOrTecnicoOrBot")]
    public async Task<IActionResult> ChangeStatus(Guid id, [FromBody] ChangeTicketStatusDto dto)
    {
        if (!await CanActOnTicketAsync(id)) return NotFoundResult("Ticket no encontrado.");
        var v = await _statusVal.ValidateAsync(dto);
        if (!v.IsValid) return BadRequestResult(string.Join(" ", v.Errors.Select(e => e.ErrorMessage)));
        var r = await _mediator.Send(new ChangeTicketStatusCommand(id, dto, CurrentUserId, CurrentUserName, ClientIp, UserAgent));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    [HttpPatch("{id:guid}/assign")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Assign(Guid id, [FromBody] AssignTicketDto dto)
    {
        var v = await _assignVal.ValidateAsync(dto);
        if (!v.IsValid) return BadRequestResult(string.Join(" ", v.Errors.Select(e => e.ErrorMessage)));
        var r = await _mediator.Send(new AssignTicketCommand(id, dto, CurrentUserId, CurrentUserName, ClientIp, UserAgent));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    [HttpPatch("{id:guid}/close")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Close(Guid id)
    {
        var r = await _mediator.Send(new CloseTicketCommand(id, CurrentUserId, CurrentUserName, ClientIp, UserAgent));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    [HttpPost("{id:guid}/comments")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> AddComment(Guid id, [FromBody] AddCommentDto dto)
    {
        if (!await CanActOnTicketAsync(id)) return NotFoundResult("Ticket no encontrado.");
        var v = await _commentVal.ValidateAsync(dto);
        if (!v.IsValid) return BadRequestResult(string.Join(" ", v.Errors.Select(e => e.ErrorMessage)));
        var r = await _mediator.Send(new AddCommentCommand(id, dto, CurrentUserId, CurrentUserName, ClientIp, UserAgent));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    [HttpPost("{id:guid}/worklogs")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> AddWorkLog(Guid id, [FromBody] AddWorkLogDto dto)
    {
        if (!await CanActOnTicketAsync(id)) return NotFoundResult("Ticket no encontrado.");
        var v = await _workLogVal.ValidateAsync(dto);
        if (!v.IsValid) return BadRequestResult(string.Join(" ", v.Errors.Select(e => e.ErrorMessage)));
        var r = await _mediator.Send(new AddWorkLogCommand(id, dto, CurrentUserId, CurrentUserName, ClientIp, UserAgent));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    // Slots disponibles para agendar una visita técnica sobre
    // este ticket — usado por el chatbot antes de llamar POST {id}/visits.
    // Sin override: hereda AdminOrTecnico del controller, misma política que
    // ya usa la cuenta de servicio del chatbot para crear tickets (Create) y
    // consultar recurrencia (GetRecentTicketCount, Fase A) — sin cambios de auth.
    [HttpGet("{id:guid}/visit-slots")]
    [Authorize(Policy = "AdminOrTecnicoOrBot")]
    public async Task<IActionResult> GetVisitSlots(Guid id, [FromQuery] int diasAdelante = 5)
    {
        if (!await CanActOnTicketAsync(id)) return NotFoundResult("Ticket no encontrado.");
        var r = await _mediator.Send(new GetTicketVisitSlotsQuery(id, diasAdelante));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    [HttpPost("{id:guid}/visits")]
    [Authorize(Policy = "AdminOrTecnicoOrBot")]
    public async Task<IActionResult> ScheduleVisit(Guid id, [FromBody] ScheduleVisitDto dto)
    {
        if (!await CanActOnTicketAsync(id)) return NotFoundResult("Ticket no encontrado.");
        var v = await _visitVal.ValidateAsync(dto);
        if (!v.IsValid) return BadRequestResult(string.Join(" ", v.Errors.Select(e => e.ErrorMessage)));
        var r = await _mediator.Send(new ScheduleVisitCommand(id, dto, CurrentUserId, CurrentUserName, ClientIp, UserAgent));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    [HttpPatch("{id:guid}/reschedule")]
    [Authorize(Policy = "AllRolesOrBot")]
    public async Task<IActionResult> RescheduleVisit(Guid id, [FromBody] RescheduleTicketVisitDto dto)
    {
        var v = await _rescheduleVal.ValidateAsync(dto);
        if (!v.IsValid) return BadRequestResult(string.Join(" ", v.Errors.Select(e => e.ErrorMessage)));
        var r = await _mediator.Send(new RescheduleTicketVisitCommand(id, dto, CurrentUserId, CurrentUserName, ClientIp, UserAgent));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    [HttpGet("sla-plans")]
        // F8.1 — Fijada explícitamente. Antes heredaba la de la clase; al
        // ampliar el piso de la clase para admitir al bot, heredarla la
        // habría abierto también a él sin que nadie lo decidiera.
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetSlaPlans()
        => OkResult(await _mediator.Send(new GetSlaPlansQuery()));

    [HttpPost("sla-plans")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> CreateSlaPlan([FromBody] CreateSlaPlanDto dto)
    {
        var r = await _mediator.Send(new CreateSlaPlanCommand(dto));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    [HttpPut("sla-plans/{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateSlaPlan(Guid id, [FromBody] UpdateSlaPlanDto dto)
    {
        var r = await _mediator.Send(new UpdateSlaPlanCommand(id, dto));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    [HttpDelete("sla-plans/{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> DeleteSlaPlan(Guid id)
    {
        var r = await _mediator.Send(new DeleteSlaPlanCommand(id));
        return r.IsSuccess ? OkResult(r.Value) : BadRequestResult(r.ErrorMessage);
    }

    [HttpGet("types")]
    [Authorize(Policy = "AllRoles")]
    public IActionResult GetTypes()
        => OkResult(Enum.GetNames<TicketType>());

    [HttpGet("balanceo")]
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetBalanceoResumen()
        => OkResult(new BalancingSummaryDto(await _balanceoSvc.GetCargaResumenAsync()));

    [HttpGet("{id:guid}/attachments")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetAttachments(Guid id)
        => OkResult(await _attSvc.GetByTicketAsync(id));

    [HttpPost("{id:guid}/attachments")]
    [Authorize(Policy = "AdminOrTecnico")]
    [RequestSizeLimit(15 * 1024 * 1024)]
    public async Task<IActionResult> UploadAttachment(
        Guid id, IFormFile file, [FromForm] string? descripcion = null)
    {
        if (!await CanActOnTicketAsync(id)) return NotFoundResult("Ticket no encontrado.");
        if (file is null || file.Length == 0) return BadRequestResult("No se recibió archivo.");
        using var stream = file.OpenReadStream();
        var result = await _attSvc.UploadAsync(
            id, file.FileName, file.ContentType, file.Length,
            stream, descripcion, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkResult(result.Value) : BadRequestResult(result.ErrorMessage);
    }

    [HttpGet("{id:guid}/activity")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> GetActivity(Guid id)
        => OkResult(await _mediator.Send(new GetTicketActivityQuery(id)));

    [HttpGet("{id:guid}/attachments/{attId:guid}/download")]
    [Authorize(Policy = "AllRoles")]
    public async Task<IActionResult> DownloadAttachment(Guid id, Guid attId)
    {
        var result = await _attSvc.DownloadAsync(attId);
        if (!result.IsSuccess) return NotFoundResult(result.ErrorMessage);
        var (stream, ct, fn) = result.Value;
        return File(stream, ct, fn);
    }

    [HttpDelete("{id:guid}/attachments/{attId:guid}")]
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> DeleteAttachment(Guid id, Guid attId)
    {
        if (!await CanActOnTicketAsync(id)) return NotFoundResult("Ticket no encontrado.");
        var result = await _attSvc.DeleteAsync(attId, CurrentUserId, CurrentUserName, ClientIp);
        return result.IsSuccess ? OkMessage("Adjunto eliminado.") : BadRequestResult(result.ErrorMessage);
    }

    [HttpGet("sla-report")]
    [Authorize(Policy = "AdminOrTecnico")]
    public async Task<IActionResult> GetSlaReport(
        [FromQuery] DateTime? desde = null,
        [FromQuery] DateTime? hasta = null,
        [FromQuery] string?   tecnico = null)
        => OkResult(await _mediator.Send(new GetSlaReportQuery(desde, hasta, tecnico)));

    [HttpPost("{id:guid}/reopen")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Reopen(Guid id, [FromBody] ReopenTicketDto dto)
    {
        var result = await _mediator.Send(new ChangeTicketStatusCommand(
            id,
            new ChangeTicketStatusDto { Status = "Abierto", ResolutionMessage = null },
            CurrentUserId, CurrentUserName, ClientIp, UserAgent));
        return result.IsSuccess ? OkMessage("Ticket reabierto.") : BadRequestResult(result.ErrorMessage);
    }
}

public record ReopenTicketDto(string Motivo);
