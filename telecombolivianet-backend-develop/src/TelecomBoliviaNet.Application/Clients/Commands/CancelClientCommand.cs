using MediatR;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Application.Clients.Helpers;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Tickets;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Clients.Commands;

public record CancelClientCommand(
    Guid   ClientId,
    bool   Confirmed,
    Guid   ActorId,
    string ActorName,
    string ClientIp) : IRequest<Result<string>>;

public class CancelClientHandler : IRequestHandler<CancelClientCommand, Result<string>>
{
    private readonly IClientRepository        _clientRepo;
    private readonly IGenericRepository<SupportTicket> _ticketRepo;
    private readonly AuditService                      _audit;
    private readonly TicketNumberService                _ticketNumSvc;

    public CancelClientHandler(
        IClientRepository        clientRepo,
        IGenericRepository<SupportTicket> ticketRepo,
        AuditService                      audit,
        TicketNumberService                ticketNumSvc)
    {
        _clientRepo   = clientRepo;
        _ticketRepo   = ticketRepo;
        _audit        = audit;
        _ticketNumSvc = ticketNumSvc;
    }

    public async Task<Result<string>> Handle(CancelClientCommand cmd, CancellationToken ct)
    {
        var client = await _clientRepo.GetWithInvoicesAsync(cmd.ClientId, ct);

        if (client is null) return Result<string>.Failure("Cliente no encontrado.");
        if (client.Status == ClientStatus.DadoDeBaja)
            return Result<string>.Failure("El cliente ya está dado de baja.");

        var debt = ClientProjectionHelpers.CalcDebt(client.Invoices);
        if (debt > 0 && !cmd.Confirmed)
            return Result<string>.Success("needs_confirmation");

        client.Cancel();
        client.IsDeleted   = true;
        client.DeletedAt   = DateTime.UtcNow;
        client.DeletedById = cmd.ActorId;

        _clientRepo.Update(client);

        await _clientRepo.SaveChangesAsync();
        await _audit.LogAsync("Clientes", "CLIENT_CANCELLED",
            $"Cliente dado de baja: {client.TbnCode} — {client.FullName}" +
            (debt > 0 ? $" (con deuda: Bs. {debt:N2})" : ""),
            userId: cmd.ActorId, userName: cmd.ActorName, ip: cmd.ClientIp, entityId: client.Id);

        if (!string.IsNullOrWhiteSpace(client.OnuSerialNumber))
        {
            var ticket = new SupportTicket
            {
                TicketNumber    = await _ticketNumSvc.NextAsync(),
                ClientId        = client.Id,
                Type            = TicketType.RecoleccionEquipo,
                Priority        = TicketPriority.Media,
                Status          = TicketStatus.Abierto,
                Origin          = TicketOrigin.Automatico,
                Subject         = $"Recolección de equipo — {client.TbnCode} — {client.FullName}",
                Description     = $"Recolección de equipo ONU (S/N: {client.OnuSerialNumber}) " +
                                   $"del cliente dado de baja: {client.TbnCode} — {client.FullName}",
                CreatedByUserId = cmd.ActorId,
                CreatedAt       = DateTime.UtcNow,
                DueDate         = DateTime.UtcNow.AddHours(AppConstants.Time.OnuCollectionDeadlineHours)
            };
            await _ticketRepo.AddAsync(ticket);
            await _audit.LogAsync("Tickets", "TICKET_AUTO_CREATED",
                $"Ticket de recolección creado para {client.TbnCode} (ONU: {client.OnuSerialNumber})",
                userId: cmd.ActorId, userName: cmd.ActorName, ip: cmd.ClientIp);

            return Result<string>.Success("cancelled_with_ticket");
        }

        return Result<string>.Success("cancelled");
    }
}
