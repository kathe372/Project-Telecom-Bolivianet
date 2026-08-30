using MediatR;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Application.Tickets.Mapping;

namespace TelecomBoliviaNet.Application.Tickets.Queries;

public record GetOverdueSlaQuery : IRequest<IEnumerable<TicketListItemDto>>;

public class GetOverdueSlaHandler : IRequestHandler<GetOverdueSlaQuery, IEnumerable<TicketListItemDto>>
{
    private readonly ITicketRepository _ticketRepo;

    public GetOverdueSlaHandler(ITicketRepository ticketRepo) => _ticketRepo = ticketRepo;

    public async Task<IEnumerable<TicketListItemDto>> Handle(GetOverdueSlaQuery _, CancellationToken ct)
    {
        var items = await _ticketRepo.GetOverdueSlaAsync(DateTime.UtcNow, ct: ct);
        return items.Select(TicketMapper.ToListItem);
    }
}

public record GetSlaReportQuery(DateTime? Desde, DateTime? Hasta, string? Tecnico)
    : IRequest<IEnumerable<TicketListItemDto>>;

public class GetSlaReportHandler : IRequestHandler<GetSlaReportQuery, IEnumerable<TicketListItemDto>>
{
    private readonly ITicketRepository _ticketRepo;

    public GetSlaReportHandler(ITicketRepository ticketRepo) => _ticketRepo = ticketRepo;

    public async Task<IEnumerable<TicketListItemDto>> Handle(GetSlaReportQuery q, CancellationToken ct)
    {
        var items = await _ticketRepo.GetOverdueSlaAsync(
            DateTime.UtcNow, q.Desde, q.Hasta, q.Tecnico, ct);
        return items.Select(TicketMapper.ToListItem);
    }
}
