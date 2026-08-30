using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Coverage.Services;

public class BoxReservationService : IBoxReservationService
{
    // Alineado con CheckCoverageQueryHandler (techo global por defecto).
    private const int DefaultMaxCableMeters = 250;
    // Mejora 2: alineado con CheckCoverageQueryHandler (sinuosidad por defecto).
    private const double DefaultSinuosityFactor = 1.4;
    // Mejora 3: TTL por defecto de una reserva de puerto abandonada (72 h).
    private const int DefaultTtlHours = 72;

    private readonly ICoverageQueryService            _coverage;
    private readonly IPortReservationStore            _store;
    private readonly IGenericRepository<SystemConfig> _config;

    public BoxReservationService(
        ICoverageQueryService            coverage,
        IPortReservationStore            store,
        IGenericRepository<SystemConfig> config)
    {
        _coverage = coverage;
        _store    = store;
        _config   = config;
    }

    public async Task<BoxReservation?> TryReserveAsync(
        double lat, double lng, Guid installationId, CancellationToken ct = default)
    {
        var maxMeters = await ReadIntConfigAsync(
            SystemConfigKeys.CoverageMaxCableDropMeters, DefaultMaxCableMeters);
        var sinuosity = await ReadSinuosityAsync();

        // NearZoneBoundaryMeters=0 — esta llamada solo le importa si el
        // punto está Confirmed o no (re-verificación justo antes de reservar un
        // puerto), no necesita distinguir NEAR_ZONE_BOUNDARY de NoCoverage.
        var check = await _coverage.CheckAsync(lat, lng, maxMeters, sinuosity, 0, ct);
        if (check.Outcome != CoverageOutcome.Confirmed || check.RecommendedBoxId is null)
            return null;

        var ttlHours = await ReadIntConfigAsync(
            SystemConfigKeys.CoveragePortReservationTtlHours, DefaultTtlHours);

        // El lock de fila + la transacción viven en el store (Infrastructure).
        var zoneId = await _store.TryReserveAsync(
            check.RecommendedBoxId.Value, installationId, TimeSpan.FromHours(ttlHours), ct);
        if (zoneId is null) return null; // se llenó entre el check y la reserva

        return new BoxReservation(check.RecommendedBoxId.Value, zoneId.Value);
    }

    public async Task ReleaseAsync(Installation installation, CancellationToken ct = default)
    {
        if (installation.DistributionBoxId is not Guid boxId) return;
        if (installation.Status == InstallationStatus.Completada) return;

        await _store.ReleaseByInstallationAsync(installation.Id, boxId, ct);
        installation.DistributionBoxId = null;
    }

    private async Task<int> ReadIntConfigAsync(string key, int fallback)
    {
        var cfg = await _config.FirstOrDefaultAsync(c => c.Key == key);
        return int.TryParse(cfg?.Value, out var v) && v > 0 ? v : fallback;
    }

    private async Task<double> ReadSinuosityAsync()
    {
        var cfg = await _config.FirstOrDefaultAsync(
            c => c.Key == SystemConfigKeys.CoverageSinuosityFactor);
        return double.TryParse(cfg?.Value,
            System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out var s) && s >= 1.0
            ? s
            : DefaultSinuosityFactor;
    }
}
