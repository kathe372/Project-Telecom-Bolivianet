using NetTopologySuite.Geometries;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Coverage;

public enum CoverageQueryChannel { Api, Web, WhatsApp, Admin }

public enum CoverageQueryInputType { Coords, GpsShare, Address }

/// <summary>
/// Log de cada consulta de cobertura (demanda). Sirve, sobre todo, para ver
/// DÓNDE hay clientes queriendo servicio y no llegamos (resultados distintos de
/// CONFIRMED con su ubicación y, si lo dieron, su contacto). Es la "tabla de oro"
/// comercial para decidir expansión de red.
/// </summary>
public class CoverageQuery : Entity
{
    public DateTime               QueriedAt    { get; set; } = DateTime.UtcNow;
    public CoverageQueryInputType InputType    { get; set; } = CoverageQueryInputType.Coords;
    public Point                  Location     { get; set; } = null!;
    // Veredicto efectivo: CONFIRMED / NO_COVERAGE / ZONE_IN_EXPANSION / NO_CAPACITY / NO_BOXES_REGISTERED.
    public string                 Result       { get; set; } = string.Empty;
    public Guid?                  MatchedBoxId { get; set; }
    public string?                ZoneName     { get; set; }
    public CoverageQueryChannel   Channel      { get; set; } = CoverageQueryChannel.Api;
    public string?                ContactPhone { get; set; }
    public string?                ContactName  { get; set; }
}
