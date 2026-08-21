using MediatR;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO.Converters;
using System.Text.Json;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Coverage.Commands;

public record UpdateCoverageZoneCommand(
    Guid                      Id,
    UpdateCoverageZoneRequest Request) : IRequest<Result<CoverageZoneSummaryDto>>;

public class UpdateCoverageZoneHandler
    : IRequestHandler<UpdateCoverageZoneCommand, Result<CoverageZoneSummaryDto>>
{
    private static readonly JsonSerializerOptions GeoJsonOptions = new()
    {
        Converters = { new GeoJsonConverterFactory() }
    };

    private readonly IGenericRepository<CoverageZone> _zoneRepo;

    public UpdateCoverageZoneHandler(IGenericRepository<CoverageZone> zoneRepo)
        => _zoneRepo = zoneRepo;

    public async Task<Result<CoverageZoneSummaryDto>> Handle(
        UpdateCoverageZoneCommand cmd, CancellationToken ct)
    {
        var zone = await _zoneRepo.GetByIdAsync(cmd.Id);
        if (zone is null)
            return Result<CoverageZoneSummaryDto>.Failure("Zona de cobertura no encontrada.");

        if (!Enum.TryParse<CoverageZoneStatus>(cmd.Request.Estado, out var estado))
            return Result<CoverageZoneSummaryDto>.Failure($"Estado inválido: {cmd.Request.Estado}");

        zone.Nombre           = cmd.Request.Nombre;
        zone.Tecnologia       = cmd.Request.Tecnologia;
        zone.VelocidadMaxMbps = cmd.Request.VelocidadMaxMbps;
        zone.Estado           = estado;
        zone.FechaExpansionEstimada = string.IsNullOrWhiteSpace(cmd.Request.FechaExpansionEstimada)
            ? null
            : DateTime.Parse(cmd.Request.FechaExpansionEstimada).ToUniversalTime();

        if (!string.IsNullOrWhiteSpace(cmd.Request.GeoJson))
        {
            var geom = ParsePolygon(cmd.Request.GeoJson);
            if (geom is null)
                return Result<CoverageZoneSummaryDto>.Failure("El GeoJSON del polígono es inválido.");
            zone.Geom = geom;
        }

        _zoneRepo.Update(zone);

        await _zoneRepo.SaveChangesAsync();
        return Result<CoverageZoneSummaryDto>.Success(
            new CoverageZoneSummaryDto(zone.Id, zone.Nombre, zone.Estado.ToString()));
    }

    private static Geometry? ParsePolygon(string geoJson)
    {
        // GeoJSON inválido → null (contrato del método): el llamador lo traduce en
        // un Result.Failure con mensaje al usuario, así que no es un fallo de sistema a loguear.
        try { return JsonSerializer.Deserialize<Geometry>(geoJson, GeoJsonOptions); }
        catch { return null; }
    }
}
