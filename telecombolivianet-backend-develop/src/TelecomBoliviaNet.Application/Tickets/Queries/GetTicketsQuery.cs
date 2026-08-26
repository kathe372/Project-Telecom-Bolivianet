using MediatR;
using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Tickets.Helpers;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Tickets.Queries;

public record GetTicketsQuery(TicketFilterDto Filter) : IRequest<PagedResult<TicketListItemDto>>;

public class GetTicketsHandler : IRequestHandler<GetTicketsQuery, PagedResult<TicketListItemDto>>
{
    private readonly ITicketRepository _ticketRepo;

    public GetTicketsHandler(ITicketRepository ticketRepo) => _ticketRepo = ticketRepo;

    public async Task<PagedResult<TicketListItemDto>> Handle(GetTicketsQuery q, CancellationToken ct)
    {
        var f = q.Filter;

        var (items, total) = await _ticketRepo.GetPagedAsync(new TicketListFilter(
            Search:           f.Search,
            Status:           f.Status,
            Priority:         f.Priority,
            Type:             f.Type,
            AssignedToId:     f.AssignedToId,
            // El "ahora" lo decide el caso de uso, no el repositorio.
            OverdueSlaBefore: f.OverdueSla == true ? DateTime.UtcNow : null,
            DateFrom:         f.DateFrom,
            DateTo:           f.DateTo,
            SlaCompliant:     f.SlaCompliant,
            Page:             f.PageNumber,
            PageSize:         f.PageSize), ct);

        return new PagedResult<TicketListItemDto>(
            items.Select(TicketHelper.MapToListItem), total, f.PageNumber, f.PageSize);
    }
}
