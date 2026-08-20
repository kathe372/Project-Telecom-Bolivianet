namespace TelecomBoliviaNet.Application.Coverage;

public enum CoverageOutcome { Confirmed, Escalate, NoCoverage }

/// <summary>Caja NAP candidata (recomendada o alternativa) — para balanceo y trabajo en campo.</summary>
public record BoxOption(Guid Id, string Codigo, double DistanceMeters, int FreePorts);

public record CoverageCheckResult(
    CoverageOutcome Outcome,
    string?         ZoneName,
    string?         ZoneTechnology,
    string?         EscalationReason,
    Guid?           RecommendedBoxId,
    double?         NearestBoxDistanceMeters,
    // Mejora 4: candidatas ordenadas por más puertos libres (desempate cercanía).
    // La 1ª es la recomendada; el resto, alternativas para el técnico. Opcional con
    // default para no romper los 9 constructores existentes de este record.
    IReadOnlyList<BoxOption>? Alternatives = null);

public interface ICoverageQueryService
{
    // Mejora 2 (sinuosidad): sinuosityFactor ajusta la distancia recta al largo real
    // del cable por calles/postes (efectivo = alcance / factor). 1.0 = sin ajuste.
    // PASO 11: nearZoneBoundaryMeters — cuando el punto no cae dentro de ninguna
    // zona, distancia máxima a la zona activa más cercana para escalar en vez de
    // responder NoCoverage directo. <= 0 desactiva esta búsqueda por completo
    // (usado por BoxReservationService, que solo le importa Confirmed/no-Confirmed
    // y no necesita pagar el costo de la consulta de distancia).
    Task<CoverageCheckResult> CheckAsync(
        double lat, double lng, int maxCableDropMeters, double sinuosityFactor,
        int nearZoneBoundaryMeters, CancellationToken ct);
}
