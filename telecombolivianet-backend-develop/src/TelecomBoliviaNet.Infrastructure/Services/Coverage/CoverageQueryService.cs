using System.Linq;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;
using TelecomBoliviaNet.Application.Coverage;

namespace TelecomBoliviaNet.Infrastructure.Services.Coverage;

internal static class EscalationReasons
{
    public const string ZoneInExpansion    = "ZONE_IN_EXPANSION";
    public const string NoCapacity         = "NO_CAPACITY";
    public const string NoBoxesRegistered  = "NO_BOXES_REGISTERED";
    // Punto fuera de cualquier zona, pero a <= nearZoneBoundaryMeters
    // de la más cercana — antes cualquier punto fuera de zona (5m o 50km) caía
    // igual en NoCoverage.
    public const string NearZoneBoundary   = "NEAR_ZONE_BOUNDARY";
}

public class CoverageQueryService : ICoverageQueryService
{
    private readonly string _connectionString;
    private readonly ILogger<CoverageQueryService> _logger;

    public CoverageQueryService(IConfiguration config, ILogger<CoverageQueryService> logger)
    {
        _connectionString = config.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("DefaultConnection no configurada.");
        _logger = logger;
    }

    public async Task<CoverageCheckResult> CheckAsync(
        double lat, double lng, int maxCableDropMeters, double sinuosityFactor,
        int nearZoneBoundaryMeters, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var zone = await QueryZoneAsync(conn, lat, lng, ct);
        if (zone is null)
        {
            // El punto no cae dentro de ninguna zona — antes de rendirse
            // con NoCoverage, ver si hay una zona activa cerca del borde.
            if (nearZoneBoundaryMeters > 0)
            {
                var nearest = await QueryNearestZoneDistanceAsync(conn, lat, lng, ct);
                if (nearest is not null && nearest.DistanceMeters <= nearZoneBoundaryMeters)
                    return new CoverageCheckResult(CoverageOutcome.Escalate, nearest.Nombre, nearest.Tecnologia,
                        EscalationReasons.NearZoneBoundary, null, null);
            }
            return new CoverageCheckResult(CoverageOutcome.NoCoverage, null, null, null, null, null);
        }

        if (zone.Estado == "EnExpansion")
            return new CoverageCheckResult(CoverageOutcome.Escalate, zone.Nombre, zone.Tecnologia,
                EscalationReasons.ZoneInExpansion, null, null);

        var boxes = await QueryAvailableBoxesAsync(conn, lat, lng, zone.Id, maxCableDropMeters, sinuosityFactor, ct);
        if (boxes.Count > 0)
        {
            // Mejora 4: la 1ª ya viene ordenada por más puertos libres (desempate cercanía).
            var recommended  = boxes[0];
            var alternatives = boxes
                .Select(b => new BoxOption(b.Id, b.Codigo, b.DistanceMeters, b.FreePorts))
                .ToList();
            return new CoverageCheckResult(CoverageOutcome.Confirmed, zone.Nombre, zone.Tecnologia,
                null, recommended.Id, recommended.DistanceMeters, alternatives);
        }

        var hasAnyBox = await QueryAnyBoxExistsAsync(conn, zone.Id, ct);
        var reason = hasAnyBox ? EscalationReasons.NoCapacity : EscalationReasons.NoBoxesRegistered;

        return new CoverageCheckResult(CoverageOutcome.Escalate, zone.Nombre, zone.Tecnologia,
            reason, null, null);
    }


    private static async Task<ZoneRow?> QueryZoneAsync(
        NpgsqlConnection conn, double lat, double lng, CancellationToken ct)
    {
        const string sql = """
            SELECT "Id", "Nombre", "Tecnologia", "Estado"
            FROM "CoverageZones"
            WHERE "Estado" IN ('Activa','EnExpansion')
              AND ST_Contains("Geom", ST_SetSRID(ST_Point(@lng, @lat), 4326))
            LIMIT 1
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("lat", lat);
        cmd.Parameters.AddWithValue("lng", lng);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;

        return new ZoneRow(
            reader.GetGuid(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3));
    }

    // Distancia a la zona ACTIVA/EN EXPANSIÓN más cercana, para el
    // punto que no cayó dentro de ninguna (ST_Contains ya descartó ese caso).
    // Mismo casteo ::geography que ya usa QueryAvailableBoxesAsync para que
    // ST_Distance devuelva metros reales, no grados.
    private static async Task<ZoneDistanceRow?> QueryNearestZoneDistanceAsync(
        NpgsqlConnection conn, double lat, double lng, CancellationToken ct)
    {
        const string sql = """
            SELECT "Nombre", "Tecnologia",
                   ST_Distance("Geom"::geography, ST_SetSRID(ST_Point(@lng, @lat), 4326)::geography) AS dist_metros
            FROM "CoverageZones"
            WHERE "Estado" IN ('Activa','EnExpansion')
            ORDER BY dist_metros ASC
            LIMIT 1
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("lat", lat);
        cmd.Parameters.AddWithValue("lng", lng);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;

        return new ZoneDistanceRow(reader.GetString(0), reader.GetString(1), reader.GetDouble(2));
    }

    private static async Task<List<BoxRow>> QueryAvailableBoxesAsync(
        NpgsqlConnection conn, double lat, double lng, Guid zoneId,
        int maxMeters, double sinuosityFactor, CancellationToken ct)
    {
        // El alcance de cable se toma de la propia caja (DistanciaMaxCableMetros),
        // con @maxMetros (config global) como TECHO. LEAST ignora NULL en PostgreSQL.
        // Mejora 2 (sinuosidad): la distancia RECTA disponible = alcance / @sinuosity,
        // porque el cable va por calles/postes (más largo que la línea recta).
        // Mejora 4 (balanceo): se ordena por MÁS puertos libres (desempate cercanía) y
        // se devuelven varias candidatas (recomendada + alternativas).
        const string sql = """
            SELECT "Id",
                   "Codigo",
                   ST_Distance("Location"::geography,
                               ST_SetSRID(ST_Point(@lng, @lat), 4326)::geography) AS dist_metros,
                   ("PuertosTotal" - "PuertosOcupados" - "PuertosReservados") AS free_ports
            FROM "DistributionBoxes"
            WHERE "ZoneId" = @zoneId
              AND "Estado" = 'Activo'
              AND ("PuertosTotal" - "PuertosOcupados" - "PuertosReservados") > 0
              AND ST_DWithin("Location"::geography,
                             ST_SetSRID(ST_Point(@lng, @lat), 4326)::geography,
                             LEAST("DistanciaMaxCableMetros", @maxMetros) / @sinuosity)
            ORDER BY free_ports DESC, dist_metros ASC
            LIMIT 5
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("lat", lat);
        cmd.Parameters.AddWithValue("lng", lng);
        cmd.Parameters.AddWithValue("zoneId", zoneId);
        cmd.Parameters.AddWithValue("maxMetros", (double)maxMeters);
        cmd.Parameters.AddWithValue("sinuosity", sinuosityFactor);

        var rows = new List<BoxRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            rows.Add(new BoxRow(
                reader.GetGuid(0), reader.GetString(1), reader.GetDouble(2), reader.GetInt32(3)));
        return rows;
    }

    private static async Task<bool> QueryAnyBoxExistsAsync(
        NpgsqlConnection conn, Guid zoneId, CancellationToken ct)
    {
        const string sql = """
            SELECT EXISTS(
                SELECT 1 FROM "DistributionBoxes"
                WHERE "ZoneId" = @zoneId AND "Estado" != 'Mantenimiento'
            )
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("zoneId", zoneId);
        return (bool)(await cmd.ExecuteScalarAsync(ct))!;
    }

    private record ZoneRow(Guid Id, string Nombre, string Tecnologia, string Estado);
    private record BoxRow(Guid Id, string Codigo, double DistanceMeters, int FreePorts);
    private record ZoneDistanceRow(string Nombre, string Tecnologia, double DistanceMeters);
}
