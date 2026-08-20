using MediatR;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Coverage.Queries;

/// <summary>
/// Reporte de demanda: consultas de cobertura recientes. Filtro opcional por
/// resultado (p.ej. "NO_COVERAGE"/"NO_CAPACITY" para ver dónde falta red).
/// </summary>
public record GetCoverageQueriesQuery(string? Result = null, int Limit = 200)
    : IRequest<List<CoverageQueryDto>>;

public class GetCoverageQueriesQueryHandler
    : IRequestHandler<GetCoverageQueriesQuery, List<CoverageQueryDto>>
{
    private readonly IGenericRepository<CoverageQuery> _repo;

    public GetCoverageQueriesQueryHandler(IGenericRepository<CoverageQuery> repo) => _repo = repo;

    public async Task<List<CoverageQueryDto>> Handle(GetCoverageQueriesQuery q, CancellationToken ct)
    {
        var items = await _repo.ListAsync(
            q.Result is null ? null : x => x.Result == q.Result);

        return items
            .OrderByDescending(x => x.QueriedAt)
            .Take(q.Limit <= 0 ? 200 : q.Limit)
            .Select(x => new CoverageQueryDto(
                x.Id, x.QueriedAt, x.Result, x.ZoneName,
                x.Channel.ToString(), x.ContactPhone, x.ContactName,
                x.Location.Y, x.Location.X))   // Point.Y = lat, Point.X = lng
            .ToList();
    }
}
