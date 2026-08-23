using MediatR;
using NetTopologySuite.IO.Converters;
using System.Text.Json;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Coverage.Queries;

public record GetCoverageZonesQuery(bool IncludeGeometry) : IRequest<List<CoverageZoneDto>>;

public class GetCoverageZonesQueryHandler
    : IRequestHandler<GetCoverageZonesQuery, List<CoverageZoneDto>>
{
    private static readonly JsonSerializerOptions GeoJsonOptions = new()
    {
        Converters = { new GeoJsonConverterFactory() }
    };

    private readonly IGenericRepository<CoverageZone> _zoneRepo;
    private readonly IDistributionBoxRepository       _boxRepo;

    public GetCoverageZonesQueryHandler(
        IGenericRepository<CoverageZone> zoneRepo,
        IDistributionBoxRepository       boxRepo)
    {
        _zoneRepo = zoneRepo;
        _boxRepo  = boxRepo;
    }

    public async Task<List<CoverageZoneDto>> Handle(
        GetCoverageZonesQuery query, CancellationToken ct)
    {
        // ListReadOnlyAsync ya existía en IGenericRepository: no hacía falta EF
        // para esto, solo usarlo.
        var zones = await _zoneRepo.ListReadOnlyAsync();

        // El conteo por zona se sigue agregando en SQL; ahora vive en el repositorio.
        var countMap = await _boxRepo.CountActiveByZoneAsync(ct);

        return zones.Select(z => new CoverageZoneDto(
            z.Id,
            z.Nombre,
            z.Tecnologia,
            z.VelocidadMaxMbps,
            z.Estado.ToString(),
            z.FechaExpansionEstimada?.ToString("yyyy-MM-dd"),
            query.IncludeGeometry ? JsonSerializer.Serialize(z.Geom, GeoJsonOptions) : null,
            countMap.GetValueOrDefault(z.Id, 0))).ToList();
    }
}
