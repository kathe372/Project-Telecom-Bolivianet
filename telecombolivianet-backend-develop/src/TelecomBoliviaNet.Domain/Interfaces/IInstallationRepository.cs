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

    /// <summary>Ficha completa: cliente, plan, técnico titular, caja y equipo asignado.</summary>
    Task<Installation?> GetDetailAsync(Guid id, CancellationToken ct = default);

    /// <summary>Página del listado, filtrada y ordenada por fecha y hora.</summary>
    Task<(List<Installation> Items, int Total)> GetPagedAsync(
        InstallationListFilter filtro, CancellationToken ct = default);

    /// <summary>Instalaciones de un rango de fechas, para el calendario.</summary>
    Task<List<Installation>> GetCalendarRangeAsync(
        DateTime desde, DateTime hasta, Guid? tecnicoId, CancellationToken ct = default);

    /// <summary>
    /// Instalaciones de un técnico en un día, sea como titular o como parte del
    /// equipo asignado. Las canceladas no salen en la agenda.
    /// </summary>
    Task<List<Installation>> GetTechnicianDayAsync(
        Guid tecnicoId, DateTime fecha, CancellationToken ct = default);
}

/// <summary>
/// Criterios del listado de instalaciones.
///
/// Vive en Domain, junto a la interfaz que lo consume, y NO es el DTO de la API:
/// ese sigue en Application con sus strings sin parsear. Traducirlo es trabajo del
/// caso de uso, que es quien sabe qué significa un filtro vacío.
/// </summary>
public record InstallationListFilter(
    InstallationStatus? Status         = null,
    DateTime?           Fecha          = null,
    Guid?               TecnicoId      = null,
    Guid?               ClienteId      = null,
    bool                SoloProspectos = false,
    int                 Page           = 1,
    int                 PageSize       = 20);
