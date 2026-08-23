using MediatR;
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
    private readonly IDistributionBoxRepository _boxRepo;

    public GetDistributionBoxesQueryHandler(IDistributionBoxRepository boxRepo)
        => _boxRepo = boxRepo;

    public async Task<List<DistributionBoxDto>> Handle(
        GetDistributionBoxesQuery query, CancellationToken ct)
    {
        // El filtrado y el Include viven ahora en el repositorio: este handler
        // dice QUÉ necesita, no CÓMO se consulta.
        var boxes = await _boxRepo.GetWithZoneAsync(query.ZoneId, query.Status, ct);

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
