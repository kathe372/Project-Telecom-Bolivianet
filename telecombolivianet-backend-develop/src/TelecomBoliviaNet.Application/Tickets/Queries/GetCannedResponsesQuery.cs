using MediatR;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Tickets.Queries;

public record GetCannedResponsesQuery(bool IncludeInactive = false)
    : IRequest<IEnumerable<CannedResponseDto>>;

public class GetCannedResponsesHandler
    : IRequestHandler<GetCannedResponsesQuery, IEnumerable<CannedResponseDto>>
{
    private readonly IGenericRepository<TicketCannedResponse> _repo;

    public GetCannedResponsesHandler(IGenericRepository<TicketCannedResponse> repo)
        => _repo = repo;

    public async Task<IEnumerable<CannedResponseDto>> Handle(
        GetCannedResponsesQuery query, CancellationToken ct)
    {
        // Catálogo de respuestas predefinidas: decenas de filas como mucho, así
        // que el filtro va en SQL y el orden en memoria.
        var items = (await _repo.ListReadOnlyAsync(
                         query.IncludeInactive ? null : r => r.IsActive))
                    .OrderBy(r => r.Category)
                    .ThenBy(r => r.Title)
                    .ToList();
        return items.Select(r => new CannedResponseDto(
            r.Id, r.Title, r.Body, r.Category, r.IsActive, r.CreatedAt));
    }
}
