using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Coverage;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Infrastructure.Services.Coverage;

/// <summary>
/// Implementación RESILIENTE del log de demanda: si el registro falla (p.ej. la
/// tabla aún no existe, o un error transitorio de BD), loguea un warning y sigue.
/// La consulta de cobertura NUNCA se rompe por el log.
/// </summary>
public class CoverageDemandRecorder : ICoverageDemandRecorder
{
    private readonly IGenericRepository<CoverageQuery> _repo;
    private readonly ILogger<CoverageDemandRecorder>   _logger;

    public CoverageDemandRecorder(
        IGenericRepository<CoverageQuery> repo,
        ILogger<CoverageDemandRecorder>   logger)
    {
        _repo   = repo;
        _logger = logger;
    }

    public async Task RecordAsync(CoverageQuery query, CancellationToken ct)
    {
        try
        {
            await _repo.AddAsync(query);
            await _repo.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "No se pudo registrar la consulta de cobertura (demanda) — se continúa sin romper la respuesta.");
        }
    }
}
