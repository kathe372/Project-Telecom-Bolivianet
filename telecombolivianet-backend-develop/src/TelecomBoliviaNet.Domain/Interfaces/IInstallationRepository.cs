using TelecomBoliviaNet.Domain.Entities.Installations;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Consultas de instalación expresadas en lenguaje de negocio. Ver ADR-001.
/// Crece por demanda, igual que <see cref="IClientRepository"/>.
/// </summary>
public interface IInstallationRepository : IGenericRepository<Installation>
{
    /// <summary>
    /// Para cada cliente instalado, el código de la caja NAP de su instalación
    /// MÁS RECIENTE completada. Alimenta el mapa de cobertura.
    ///
    /// El agrupado y el "más reciente" se resuelven en SQL: traer todas las
    /// instalaciones a memoria para quedarse con una por cliente sería
    /// desperdiciar la base de datos.
    /// </summary>
    Task<Dictionary<Guid, string>> GetLatestBoxCodeByClientAsync(CancellationToken ct = default);
}
