using MediatR;
using Microsoft.EntityFrameworkCore;
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

    private readonly IGenericRepository<CoverageZone>    _zoneRepo;
    private readonly IGenericRepository<DistributionBox> _boxRepo;

    public GetCoverageZonesQueryHandler(
        IGenericRepository<CoverageZone>    zoneRepo,
        IGenericRepository<DistributionBox> boxRepo)
    {
        _zoneRepo = zoneRepo;
        _boxRepo  = boxRepo;
    }

    public async Task<List<CoverageZoneDto>> Handle(
        GetCoverageZonesQuery query, CancellationToken ct)
    {
        var zones = await _zoneRepo.GetAllReadOnly().ToListAsync(ct);

        var boxCounts = await _boxRepo.GetAllReadOnly()
            .Where(b => b.Estado == DistributionBoxStatus.Activo)
            .GroupBy(b => b.ZoneId)
            .Select(g => new { ZoneId = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var countMap = boxCounts.ToDictionary(x => x.ZoneId, x => x.Count);

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
