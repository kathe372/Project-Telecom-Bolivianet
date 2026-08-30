using MediatR;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Application.Tickets.Services;

namespace TelecomBoliviaNet.Application.Tickets.Commands;

public record UpdateTicketCommand(
    Guid            TicketId,
    UpdateTicketDto Dto,
    Guid            ActorId,
    string          ActorName,
    string          ClientIp,
    string?         UserAgent = null) : IRequest<Result<TicketDetailDto>>;

public class UpdateTicketHandler : IRequestHandler<UpdateTicketCommand, Result<TicketDetailDto>>
{
    private readonly IGenericRepository<SupportTicket> _ticketRepo;
    private readonly IGenericRepository<TicketComment> _commentRepo;
    private readonly TicketDetailBuilder _detalle;
    private readonly TicketDueDateService _vencimiento;
    private readonly AuditService                      _audit;

    public UpdateTicketHandler(
        IGenericRepository<SupportTicket> ticketRepo,
        IGenericRepository<TicketComment> commentRepo,
        TicketDetailBuilder detalle,
        TicketDueDateService vencimiento,
        AuditService                      audit)
    {
        _ticketRepo  = ticketRepo;
        _commentRepo = commentRepo;
        _detalle = detalle;
        _vencimiento = vencimiento;
        _audit       = audit;
    }

    public async Task<Result<TicketDetailDto>> Handle(UpdateTicketCommand cmd, CancellationToken ct)
    {
        var dto    = cmd.Dto;
        var ticket = await _detalle.CargarAsync(cmd.TicketId);
        if (ticket is null) return Result<TicketDetailDto>.Failure("Ticket no encontrado.");
        if (ticket.Status == TicketStatus.Cerrado)
            return Result<TicketDetailDto>.Failure("Un ticket cerrado no puede modificarse.");

        if (dto.Subject is not null)      ticket.Subject      = dto.Subject.Trim();
        if (dto.Description is not null)  ticket.Description  = dto.Description.Trim();
        if (dto.SupportGroup is not null) ticket.SupportGroup = dto.SupportGroup.Trim();
        if (dto.RootCause is not null)    ticket.RootCause    = dto.RootCause.Trim();

        if (dto.Priority is not null && Enum.TryParse<TicketPriority>(dto.Priority, out var pr))
        {
            var oldPriority = ticket.Priority;
            ticket.Priority = pr;
            ticket.DueDate  = await _vencimiento.CalcularAsync(pr, ticket.CreatedAt);

            await _commentRepo.AddAsync(new TicketComment
            {
                TicketId = ticket.Id, AuthorId = cmd.ActorId,
                Type     = CommentType.NotaInterna,
                Body     = $"⚡ Prioridad cambiada: {oldPriority} → {pr}. SLA actualizado.",
                CreatedAt = DateTime.UtcNow,
            });
        }

        _ticketRepo.Update(ticket);

        await _ticketRepo.SaveChangesAsync();
        await _audit.LogAsync("Tickets", "TICKET_UPDATED",
            $"Ticket '{ticket.Subject}' actualizado.",
            cmd.ActorId, cmd.ActorName, cmd.ClientIp, cmd.UserAgent, entityId: ticket.Id);
        if (dto.Priority is not null)
            await _audit.LogAsync("SLA", "SLA_RECALCULATED",
                $"SLA recalculado en ticket '{ticket.Subject}' por cambio de prioridad.",
                cmd.ActorId, cmd.ActorName, cmd.ClientIp, cmd.UserAgent, entityId: ticket.Id);

        var detail = await _detalle.ConstruirAsync(cmd.TicketId);
        if (detail is null) return Result<TicketDetailDto>.Failure("Ticket no encontrado.");
        return Result<TicketDetailDto>.Success(detail);
    }
}
