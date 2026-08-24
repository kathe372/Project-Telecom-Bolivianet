using TelecomBoliviaNet.Domain.Entities.Coverage;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Consultas de cajas NAP expresadas en lenguaje de negocio.
///
/// <para>Existe para que la capa Application no tenga que encadenar
/// <c>GetAll().Include(...).Where(...).ToListAsync()</c>, que obliga a referenciar
/// EF Core desde los casos de uso (ver ADR-001). Cada método nombra lo que la
/// pantalla necesita, no cómo se consulta.</para>
/// </summary>
public interface IDistributionBoxRepository : IGenericRepository<DistributionBox>
{
    /// <summary>
    /// Cajas con su zona cargada, filtradas opcionalmente por zona y por estado.
    /// Alimenta el listado del panel de cobertura.
    /// </summary>
    Task<List<DistributionBox>> GetWithZoneAsync(
        Guid? zoneId = null, DistributionBoxStatus? status = null, CancellationToken ct = default);

    /// <summary>
    /// Cuántas cajas ACTIVAS tiene cada zona, indexado por zona.
    /// El conteo se hace en SQL, no trayendo las cajas a memoria.
    /// </summary>
    Task<Dictionary<Guid, int>> CountActiveByZoneAsync(CancellationToken ct = default);

    /// <summary>Una caja concreta con su zona cargada, solo lectura.</summary>
    Task<DistributionBox?> GetByIdWithZoneAsync(Guid id, CancellationToken ct = default);
}
