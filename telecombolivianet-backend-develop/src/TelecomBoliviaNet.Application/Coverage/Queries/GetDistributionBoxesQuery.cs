using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Coverage.Queries;

public record GetDistributionBoxesQuery(
    Guid?                 ZoneId,
    DistributionBoxStatus? Status) : IRequest<List<DistributionBoxDto>>;

public class GetDistributionBoxesQueryHandler
    : IRequestHandler<GetDistributionBoxesQuery, List<DistributionBoxDto>>
{
    private readonly IGenericRepository<DistributionBox> _boxRepo;

    public GetDistributionBoxesQueryHandler(IGenericRepository<DistributionBox> boxRepo)
        => _boxRepo = boxRepo;

    public async Task<List<DistributionBoxDto>> Handle(
        GetDistributionBoxesQuery query, CancellationToken ct)
    {
        IQueryable<DistributionBox> q = _boxRepo.GetAllReadOnly().Include(b => b.Zone);

        if (query.ZoneId.HasValue)
            q = q.Where(b => b.ZoneId == query.ZoneId.Value);
        if (query.Status.HasValue)
            q = q.Where(b => b.Estado == query.Status.Value);

        var boxes = await q.ToListAsync(ct);

        return boxes.Select(b => new DistributionBoxDto(
            b.Id,
            b.Codigo,
            b.DireccionReferencia,
            b.ZoneId,
            b.Zone?.Nombre ?? string.Empty,
            b.Location.Y,
            b.Location.X,
            b.PuertosTotal,
            b.PuertosOcupados,
            b.PuertosReservados,
            b.PuertosTotal - b.PuertosOcupados - b.PuertosReservados,
            b.DistanciaMaxCableMetros,
            b.Estado.ToString())).ToList();
    }
}
