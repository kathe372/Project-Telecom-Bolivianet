using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Coverage.Services;

namespace TelecomBoliviaNet.Infrastructure.Services.Coverage;

/// <summary>
/// Geocodificador basado en Nominatim (OpenStreetMap). Sesga los resultados a
/// Bolivia (<c>countrycodes</c>) y pide un solo candidato. Nunca lanza: ante error
/// de red o respuesta rara devuelve null (la consulta cae a "pedir GPS").
/// </summary>
public class NominatimGeocoder : IGeocoder
{
    private const string DefaultBaseUrl     = "https://nominatim.openstreetmap.org";
    private const string DefaultCountryCode = "bo";
    private const string DefaultUserAgent   = "TelecomBoliviaNet/1.0 (coverage check)";

    private readonly HttpClient                    _http;
    private readonly string                        _baseUrl;
    private readonly string                        _countryCodes;
    private readonly ILogger<NominatimGeocoder>    _logger;

    public NominatimGeocoder(
        HttpClient                 http,
        IConfiguration             config,
        ILogger<NominatimGeocoder> logger)
    {
        _http         = http;
        _baseUrl      = (config["Geocoding:NominatimBaseUrl"] ?? DefaultBaseUrl).TrimEnd('/');
        _countryCodes = config["Geocoding:CountryCodes"] ?? DefaultCountryCode;
        _logger       = logger;

        // Nominatim EXIGE un User-Agent identificable (si falta, responde 403).
        var userAgent = config["Geocoding:UserAgent"] ?? DefaultUserAgent;
        if (!_http.DefaultRequestHeaders.UserAgent.TryParseAdd(userAgent))
            _http.DefaultRequestHeaders.Add("User-Agent", DefaultUserAgent);
    }

    public async Task<GeocodeResult?> GeocodeAsync(string address, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(address)) return null;

        try
        {
            var url = $"{_baseUrl}/search?q={Uri.EscapeDataString(address)}" +
                      $"&format=jsonv2&limit=1&addressdetails=0&countrycodes={_countryCodes}";

            using var resp = await _http.GetAsync(url, ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Nominatim respondió {Status} para '{Address}'.",
                    (int)resp.StatusCode, address);
                return null;
            }

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

            if (doc.RootElement.ValueKind != JsonValueKind.Array ||
                doc.RootElement.GetArrayLength() == 0)
                return null;

            var first = doc.RootElement[0];
            if (!TryGetDouble(first, "lat", out var lat) ||
                !TryGetDouble(first, "lon", out var lng))
                return null;

            var confidence = TryGetDouble(first, "importance", out var imp)
                ? Math.Clamp(imp, 0, 1)
                : 0.0;
            var displayName = first.TryGetProperty("display_name", out var dn)
                ? dn.GetString()
                : null;

            return new GeocodeResult(lat, lng, confidence, displayName);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error geocodificando '{Address}' con Nominatim.", address);
            return null;
        }
    }

    // lat/lon/importance llegan como string o número según el endpoint → parse tolerante.
    private static bool TryGetDouble(JsonElement el, string prop, out double value)
    {
        value = 0;
        if (!el.TryGetProperty(prop, out var p)) return false;
        return p.ValueKind switch
        {
            JsonValueKind.Number => p.TryGetDouble(out value),
            JsonValueKind.String => double.TryParse(
                p.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out value),
            _ => false,
        };
    }
}
