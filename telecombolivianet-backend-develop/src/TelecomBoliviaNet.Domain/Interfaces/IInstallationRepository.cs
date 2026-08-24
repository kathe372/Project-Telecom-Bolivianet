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

    /// <summary>
    /// Instalación con todo lo que necesitan los comandos que la modifican:
    /// cliente, plan, ticket y técnicos asignados.
    ///
    /// <para>Es UN método y no cuatro (uno por combinación de Include) a
    /// propósito: se busca una sola fila por clave primaria, así que traer cuatro
    /// referencias de más no se nota, y en cambio evita una interfaz que crece
    /// con cada variante de consulta. Si algún día una de esas relaciones pesa,
    /// se parte entonces y no antes.</para>
    /// </summary>
    Task<Installation?> GetForCommandAsync(Guid id, CancellationToken ct = default);

    /// <summary>¿Tiene este cliente una instalación sin cerrar?</summary>
    Task<bool> HasOpenForClientAsync(Guid clientId, CancellationToken ct = default);

    /// <summary>¿Tiene este prospecto (aún sin ficha) una instalación sin cerrar?</summary>
    Task<bool> HasOpenForProspectAsync(string prospectPhone, CancellationToken ct = default);
}
