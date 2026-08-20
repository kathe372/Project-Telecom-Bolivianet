using System.Globalization;
using System.Text.RegularExpressions;
using NetTopologySuite.Geometries;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Coverage.Services;

public class AddressGeocodingService : IAddressGeocodingService
{
    // Umbral por defecto: Nominatim rara vez supera ~0.6 en importance para
    // direcciones residenciales, así que 0.3 filtra basura sin ser restrictivo.
    private const double DefaultMinConfidence = 0.3;

    private static readonly Regex Whitespace = new(@"\s+", RegexOptions.Compiled);

    private readonly IGeocoder                        _geocoder;
    private readonly IGenericRepository<GeocodeCache> _cache;
    private readonly IGenericRepository<SystemConfig> _config;

    public AddressGeocodingService(
        IGeocoder                        geocoder,
        IGenericRepository<GeocodeCache> cache,
        IGenericRepository<SystemConfig> config)
    {
        _geocoder = geocoder;
        _cache    = cache;
        _config   = config;
    }

    public async Task<GeocodeResult?> ResolveAsync(string address, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(address)) return null;

        var normalized = Normalize(address);

        var cached = await _cache.FirstOrDefaultAsync(c => c.NormalizedQuery == normalized);
        if (cached is not null)
            return new GeocodeResult(
                cached.Location.Y, cached.Location.X, cached.Confidence, cached.DisplayName);

        var hit = await _geocoder.GeocodeAsync(address, ct);
        if (hit is null) return null;

        var minConfidence = await ReadMinConfidenceAsync();
        if (hit.Confidence < minConfidence) return null; // no cacheamos resultados dudosos

        await _cache.AddAsync(new GeocodeCache
        {
            NormalizedQuery = normalized,
            Location        = new Point(hit.Lng, hit.Lat) { SRID = 4326 },
            Confidence      = hit.Confidence,
            DisplayName     = hit.DisplayName,
        });
        await _cache.SaveChangesAsync();

        return hit;
    }

    /// <summary>trim + minúsculas + espacios internos colapsados → clave de caché estable.</summary>
    private static string Normalize(string address)
        => Whitespace.Replace(address.Trim().ToLowerInvariant(), " ");

    private async Task<double> ReadMinConfidenceAsync()
    {
        var cfg = await _config.FirstOrDefaultAsync(
            c => c.Key == SystemConfigKeys.CoverageGeocodeMinConfidence);
        return double.TryParse(cfg?.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var v)
               && v is >= 0 and <= 1
            ? v
            : DefaultMinConfidence;
    }
}
