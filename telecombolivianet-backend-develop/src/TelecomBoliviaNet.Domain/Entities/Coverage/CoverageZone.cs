using NetTopologySuite.Geometries;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Coverage;

public enum CoverageZoneStatus
{
    Activa,
    EnExpansion,
    Planificada,
    Inactiva,
}

public class CoverageZone : Entity
{
    public string             Nombre                 { get; set; } = string.Empty;
    public string             Tecnologia             { get; set; } = string.Empty;
    public int                VelocidadMaxMbps       { get; set; }
    public CoverageZoneStatus Estado                 { get; set; } = CoverageZoneStatus.Planificada;
    public DateTime?          FechaExpansionEstimada { get; set; }
    public Geometry           Geom                   { get; set; } = null!;
    public DateTime           CreadoAt               { get; set; } = DateTime.UtcNow;
    public Guid               CreadoPorId            { get; set; }
}
