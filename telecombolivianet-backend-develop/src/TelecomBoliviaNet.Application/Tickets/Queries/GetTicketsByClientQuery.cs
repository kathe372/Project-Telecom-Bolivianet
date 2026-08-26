using MediatR;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Tickets.Helpers;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Tickets.Queries;

public record GetTicketsByClientQuery(Guid ClientId) : IRequest<IEnumerable<TicketListItemDto>>;

public class GetTicketsByClientHandler : IRequestHandler<GetTicketsByClientQuery, IEnumerable<TicketListItemDto>>
{
    private readonly ITicketRepository _ticketRepo;

    public GetTicketsByClientHandler(ITicketRepository ticketRepo) => _ticketRepo = ticketRepo;

    public async Task<IEnumerable<TicketListItemDto>> Handle(GetTicketsByClientQuery q, CancellationToken ct)
    {
        var items = await _ticketRepo.GetForClientAsync(q.ClientId, ct);
        return items.Select(TicketHelper.MapToListItem);
    }
}
