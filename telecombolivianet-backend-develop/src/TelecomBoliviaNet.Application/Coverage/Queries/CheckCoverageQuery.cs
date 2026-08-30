using MediatR;
using NetTopologySuite.Geometries;
using TelecomBoliviaNet.Application.DTOs.Coverage;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Coverage.Queries;

// PR-2: Channel/ContactPhone/ContactName opcionales (default null) para el log de
// demanda — el chatbot/web los pasan; el endpoint interno sin ellos no se rompe.
public record CheckCoverageQuery(
    double Lat, double Lng,
    string? Channel = null, string? ContactPhone = null, string? ContactName = null)
    : IRequest<Result<CheckCoverageResponseDto>>;

public class CheckCoverageQueryHandler
    : IRequestHandler<CheckCoverageQuery, Result<CheckCoverageResponseDto>>
{
    // Techo global por defecto cuando falta el SystemConfig. 50 m era
    // demasiado restrictivo (recortaba cajas viables); 250 es un techo comercial
    // realista. El alcance real de cada caja lo aporta DistanciaMaxCableMetros.
    private const int DefaultMaxCableMeters = 250;

    // Mejora 2: factor de sinuosidad por defecto (cable ~40% más largo que la recta).
    private const double DefaultSinuosityFactor = 1.4;

    // Umbral por defecto de "cerca del borde" — decisión de negocio (2026-08-02).
    private const int DefaultNearZoneBoundaryMeters = 200;

    private readonly ICoverageQueryService                _coverage;
    private readonly IGenericRepository<SystemConfig>     _config;
    private readonly IGenericRepository<DistributionBox>  _boxRepo;
    private readonly ICoverageDemandRecorder              _demand;

    public CheckCoverageQueryHandler(
        ICoverageQueryService                coverage,
        IGenericRepository<SystemConfig>     config,
        IGenericRepository<DistributionBox>  boxRepo,
        ICoverageDemandRecorder              demand)
    {
        _coverage = coverage;
        _config   = config;
        _boxRepo  = boxRepo;
        _demand   = demand;
    }

    public async Task<Result<CheckCoverageResponseDto>> Handle(
        CheckCoverageQuery query, CancellationToken ct)
    {
        var cfg = await _config.FirstOrDefaultAsync(
            c => c.Key == SystemConfigKeys.CoverageMaxCableDropMeters);

        var maxMeters = int.TryParse(cfg?.Value, out var m) ? m : DefaultMaxCableMeters;

        var sinCfg = await _config.FirstOrDefaultAsync(
            c => c.Key == SystemConfigKeys.CoverageSinuosityFactor);

        // Clamp a >= 1.0: un factor < 1 alargaría el alcance (incorrecto) y 0 daría división por cero.
        var sinuosity = double.TryParse(sinCfg?.Value,
            System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var s) && s >= 1.0
            ? s
            : DefaultSinuosityFactor;

        var boundaryCfg = await _config.FirstOrDefaultAsync(
            c => c.Key == SystemConfigKeys.CoverageNearZoneBoundaryMeters);
        var nearZoneBoundaryMeters = int.TryParse(boundaryCfg?.Value, out var nb) && nb > 0
            ? nb
            : DefaultNearZoneBoundaryMeters;

        var result = await _coverage.CheckAsync(
            query.Lat, query.Lng, maxMeters, sinuosity, nearZoneBoundaryMeters, ct);

        // F7 serviciabilidad: la caja recomendada acompaña la respuesta para
        // que el mapa admin muestre "caja X a Y metros, N puertos libres".
        DistributionBox? box = result.RecommendedBoxId is Guid boxId
            ? await _boxRepo.GetByIdAsync(boxId)
            : null;

        // PR-2: registrar la demanda (RecordAsync es resiliente — nunca lanza).
        var resultCode = result.Outcome switch
        {
            CoverageOutcome.Confirmed  => "CONFIRMED",
            CoverageOutcome.NoCoverage => "NO_COVERAGE",
            _                          => result.EscalationReason ?? "ESCALATE",
        };
        Enum.TryParse<CoverageQueryChannel>(query.Channel, ignoreCase: true, out var channel);
        await _demand.RecordAsync(new CoverageQuery
        {
            Location     = new Point(query.Lng, query.Lat) { SRID = 4326 },
            Result       = resultCode,
            MatchedBoxId = result.RecommendedBoxId,
            ZoneName     = result.ZoneName,
            Channel      = channel,
            ContactPhone = query.ContactPhone,
            ContactName  = query.ContactName,
        }, ct);

        return Result<CheckCoverageResponseDto>.Success(new CheckCoverageResponseDto(
            result.Outcome.ToString().ToUpperInvariant(),
            result.ZoneName,
            result.ZoneTechnology,
            result.EscalationReason,
            RecommendedBoxCodigo:        box?.Codigo,
            RecommendedBoxPuertosLibres: box is null
                ? null
                : box.PuertosTotal - box.PuertosOcupados - box.PuertosReservados,
            NearestBoxDistanceMeters:    result.NearestBoxDistanceMeters));
    }
}
