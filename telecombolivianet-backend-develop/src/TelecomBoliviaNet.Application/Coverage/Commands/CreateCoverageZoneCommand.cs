using MediatR;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO.Converters;
using System.Text.Json;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Coverage.Commands;

public record CreateCoverageZoneCommand(
    CreateCoverageZoneRequest Request,
    Guid                      ActorId) : IRequest<Result<CoverageZoneSummaryDto>>;

public class CreateCoverageZoneHandler
    : IRequestHandler<CreateCoverageZoneCommand, Result<CoverageZoneSummaryDto>>
{
    private static readonly JsonSerializerOptions GeoJsonOptions = new()
    {
        Converters = { new GeoJsonConverterFactory() }
    };

    private readonly IGenericRepository<CoverageZone> _zoneRepo;

    public CreateCoverageZoneHandler(IGenericRepository<CoverageZone> zoneRepo)
        => _zoneRepo = zoneRepo;

    public async Task<Result<CoverageZoneSummaryDto>> Handle(
        CreateCoverageZoneCommand cmd, CancellationToken ct)
    {
        if (await _zoneRepo.AnyAsync(z => z.Nombre == cmd.Request.Nombre))
            return Result<CoverageZoneSummaryDto>.Failure(
                $"Ya existe una zona con el nombre '{cmd.Request.Nombre}'.");

        var geom = ParsePolygon(cmd.Request.GeoJson);
        if (geom is null)
            return Result<CoverageZoneSummaryDto>.Failure("El GeoJSON del polígono es inválido.");

        if (!Enum.TryParse<CoverageZoneStatus>(cmd.Request.Estado, out var estado))
            return Result<CoverageZoneSummaryDto>.Failure($"Estado de zona inválido: {cmd.Request.Estado}");

        DateTime? fechaExpansion = null;
        if (!string.IsNullOrWhiteSpace(cmd.Request.FechaExpansionEstimada))
            fechaExpansion = DateTime.Parse(cmd.Request.FechaExpansionEstimada).ToUniversalTime();

        var zone = new CoverageZone
        {
            Nombre                 = cmd.Request.Nombre,
            Tecnologia             = cmd.Request.Tecnologia,
            VelocidadMaxMbps       = cmd.Request.VelocidadMaxMbps,
            Estado                 = estado,
            FechaExpansionEstimada = fechaExpansion,
            Geom                   = geom,
            CreadoAt               = DateTime.UtcNow,
            CreadoPorId            = cmd.ActorId,
        };

        await _zoneRepo.AddAsync(zone);
        await _zoneRepo.SaveChangesAsync();
        return Result<CoverageZoneSummaryDto>.Success(
            new CoverageZoneSummaryDto(zone.Id, zone.Nombre, zone.Estado.ToString()));
    }

    private static Geometry? ParsePolygon(string geoJson)
    {
        try
        {
            return JsonSerializer.Deserialize<Geometry>(geoJson, GeoJsonOptions);
        }
        catch
        {
            return null;
        }
    }
}
