using NetTopologySuite.Geometries;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Coverage;

/// <summary>
/// Caché de geocodificación dirección→coordenadas. Evita repetir llamadas al
/// proveedor externo (Nominatim tiene límite de 1 req/s y política de uso justo):
/// la misma dirección normalizada se resuelve una sola vez y luego se sirve local.
/// </summary>
public class GeocodeCache : Entity
{
    /// <summary>Clave de caché: la dirección normalizada (trim + minúsculas + espacios colapsados).</summary>
    public string   NormalizedQuery { get; set; } = string.Empty;
    public Point    Location        { get; set; } = null!;
    /// <summary>Confianza 0–1 del proveedor (importance de Nominatim).</summary>
    public double   Confidence      { get; set; }
    /// <summary>Etiqueta de la dirección resuelta que devolvió el proveedor.</summary>
    public string?  DisplayName     { get; set; }
    public DateTime CreatedAt       { get; set; } = DateTime.UtcNow;
}
