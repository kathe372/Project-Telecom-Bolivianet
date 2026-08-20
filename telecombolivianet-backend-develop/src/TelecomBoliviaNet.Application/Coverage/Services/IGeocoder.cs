namespace TelecomBoliviaNet.Application.Coverage.Services;

/// <summary>Coordenadas resueltas para una dirección, con la confianza del proveedor (0–1).</summary>
public record GeocodeResult(double Lat, double Lng, double Confidence, string? DisplayName);

/// <summary>
/// Proveedor de geocodificación (dirección de texto → coordenadas). Es un detalle
/// externo (HTTP a Nominatim), por eso vive detrás de esta interfaz en Application.
/// Devuelve null si no encontró la dirección.
/// </summary>
public interface IGeocoder
{
    Task<GeocodeResult?> GeocodeAsync(string address, CancellationToken ct = default);
}

/// <summary>
/// Geocodificación con caché: normaliza la dirección, la busca en la caché local y,
/// si no está, consulta al <see cref="IGeocoder"/> y la guarda (solo si supera el
/// umbral de confianza). Devuelve null si no se pudo ubicar con confianza suficiente.
/// </summary>
public interface IAddressGeocodingService
{
    Task<GeocodeResult?> ResolveAsync(string address, CancellationToken ct = default);
}
