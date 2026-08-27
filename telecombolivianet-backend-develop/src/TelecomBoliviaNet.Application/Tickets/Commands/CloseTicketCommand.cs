using MediatR;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Tickets.Helpers;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Tickets.Commands;

public record CloseTicketCommand(
    Guid    TicketId,
    Guid    ActorId,
    string  ActorName,
    string  ClientIp,
    string? UserAgent = null) : IRequest<Result<TicketDetailDto>>;

public class CloseTicketHandler : IRequestHandler<CloseTicketCommand, Result<TicketDetailDto>>
{
    private readonly IGenericRepository<SupportTicket> _ticketRepo;
    private readonly IGenericRepository<TicketComment> _commentRepo;
    private readonly TicketHelper                      _helper;
    private readonly AuditService                      _audit;

    public CloseTicketHandler(
        IGenericRepository<SupportTicket> ticketRepo,
        IGenericRepository<TicketComment> commentRepo,
        TicketHelper                      helper,
        AuditService                      audit)
    {
        _ticketRepo  = ticketRepo;
        _commentRepo = commentRepo;
        _helper      = helper;
        _audit       = audit;
    }

    public async Task<Result<TicketDetailDto>> Handle(CloseTicketCommand cmd, CancellationToken ct)
    {
        var ticket = await _helper.LoadAsync(cmd.TicketId);
        if (ticket is null) return Result<TicketDetailDto>.Failure("Ticket no encontrado.");
        if (ticket.Status == TicketStatus.Cerrado)
            return Result<TicketDetailDto>.Failure("El ticket ya está cerrado.");
        if (ticket.Status != TicketStatus.Resuelto)
            return Result<TicketDetailDto>.Failure("Solo se pueden cerrar tickets en estado Resuelto.");

        ticket.Status   = TicketStatus.Cerrado;
        ticket.ClosedAt = DateTime.UtcNow;
        _ticketRepo.Update(ticket);
                await _commentRepo.AddAsync(new TicketComment
        {
            TicketId = ticket.Id, AuthorId = cmd.ActorId,
            Type     = CommentType.NotaInterna,
            Body     = "🔒 Ticket cerrado manualmente.", CreatedAt = DateTime.UtcNow,
        });

        // D-13 — Un solo guardado: el cambio de estado y la nota que lo explica
        // comparten DbContext, así que este SaveChanges los persiste juntos en la
        // misma transacción implícita de EF. Antes se confirmaban por separado y
        // un fallo en el segundo dejaba el ticket cambiado sin rastro de por qué.
        await _commentRepo.SaveChangesAsync();

        await _audit.LogAsync("Tickets", "TICKET_CLOSED",
            $"Ticket '{ticket.Subject}' cerrado.",
            cmd.ActorId, cmd.ActorName, cmd.ClientIp, cmd.UserAgent, entityId: ticket.Id);

        var detail = await _helper.BuildDetailAsync(cmd.TicketId);
        if (detail is null) return Result<TicketDetailDto>.Failure("Ticket no encontrado.");
        return Result<TicketDetailDto>.Success(detail);
    }
}
