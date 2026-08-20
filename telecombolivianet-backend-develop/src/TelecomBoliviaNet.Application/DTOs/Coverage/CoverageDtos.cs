namespace TelecomBoliviaNet.Application.DTOs.Coverage;

public record CheckCoverageResponseDto(
    string  Outcome,
    string? ZoneName,
    string? ZoneTechnology,
    string? EscalationReason,
    // Serviciabilidad (F7): caja recomendada para el punto consultado
    string? RecommendedBoxCodigo     = null,
    int?    RecommendedBoxPuertosLibres = null,
    double? NearestBoxDistanceMeters = null);

// PR-4a: respuesta de la consulta por dirección de texto — coordenadas resueltas
// (con su confianza) + el resultado de cobertura sobre esas coordenadas.
public record CheckCoverageByAddressResponseDto(
    double  Lat,
    double  Lng,
    double  Confidence,
    string? ResolvedAddress,
    CheckCoverageResponseDto Coverage);

public record CoverageZoneDto(
    Guid     Id,
    string   Nombre,
    string   Tecnologia,
    int      VelocidadMaxMbps,
    string   Estado,
    string?  FechaExpansionEstimada,
    string?  GeoJson,
    int      BoxCount);

public record CoverageZoneSummaryDto(Guid Id, string Nombre, string Estado);

// PR-2: fila del reporte de demanda (log de consultas de cobertura).
public record CoverageQueryDto(
    Guid     Id,
    DateTime QueriedAt,
    string   Result,
    string?  ZoneName,
    string   Channel,
    string?  ContactPhone,
    string?  ContactName,
    double   Lat,
    double   Lng);

public record ClientLocationDto(
    Guid    Id,
    string  TbnCode,
    string  FullName,
    string  Status,
    double  Lat,
    double  Lng,
    string? BoxCodigo);

public record DistributionBoxDto(
    Guid    Id,
    string  Codigo,
    string  DireccionReferencia,
    Guid    ZoneId,
    string  ZoneName,
    double  Lat,
    double  Lng,
    int     PuertosTotal,
    int     PuertosOcupados,
    int     PuertosReservados,
    int     PuertosLibres,
    int?    DistanciaMaxCableMetros,
    string  Estado);

// PR-4b: puerto individual de una caja (read-model: quién/ONU + estado).
public record NapPortDto(
    int      Numero,
    string   Status,
    Guid?    AccountId,
    string?  OnuSerial,
    Guid?    InstallationId,
    DateTime UpdatedAt);

public record CreateCoverageZoneRequest(
    string   Nombre,
    string   Tecnologia,
    int      VelocidadMaxMbps,
    string   Estado,
    string?  FechaExpansionEstimada,
    string   GeoJson);

public record UpdateCoverageZoneRequest(
    string   Nombre,
    string   Tecnologia,
    int      VelocidadMaxMbps,
    string   Estado,
    string?  FechaExpansionEstimada,
    string?  GeoJson);

public record CreateDistributionBoxRequest(
    string  Codigo,
    string  DireccionReferencia,
    Guid    ZoneId,
    double  Lat,
    double  Lng,
    int     PuertosTotal,
    int?    DistanciaMaxCableMetros);

public record UpdateDistributionBoxRequest(
    string  Codigo,
    string  DireccionReferencia,
    int     PuertosTotal,
    int     PuertosOcupados,
    int?    DistanciaMaxCableMetros,
    string  Estado,
    // Reubicación en el mapa (F7): opcionales — solo si el pin se movió
    double? Lat = null,
    double? Lng = null);
