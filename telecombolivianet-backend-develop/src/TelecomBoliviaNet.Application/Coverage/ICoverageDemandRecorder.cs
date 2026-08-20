using TelecomBoliviaNet.Domain.Entities.Coverage;

namespace TelecomBoliviaNet.Application.Coverage;

/// <summary>
/// Registra una consulta de cobertura (demanda). La implementación es RESILIENTE:
/// nunca debe lanzar — si el registro falla, la consulta de cobertura sigue su curso.
/// </summary>
public interface ICoverageDemandRecorder
{
    Task RecordAsync(CoverageQuery query, CancellationToken ct);
}
