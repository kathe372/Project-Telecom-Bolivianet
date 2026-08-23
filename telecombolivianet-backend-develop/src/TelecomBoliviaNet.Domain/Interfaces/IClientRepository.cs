using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Consultas de cliente expresadas en lenguaje de negocio.
///
/// <para>Sustituye a las cadenas <c>GetAll().Include(...).Where(...)</c> que
/// obligaban a la capa Application a referenciar EF Core. Ver ADR-001.</para>
///
/// <para>Crece por demanda: cada método se añade cuando un caso de uso real lo
/// necesita, no "por si acaso". Una interfaz de repositorio con treinta métodos
/// que nadie usa es el mismo problema que se quiere evitar, con otro nombre.</para>
/// </summary>
public interface IClientRepository : IGenericRepository<Client>
{
    /// <summary>Cliente con su plan cargado. Null si no existe.</summary>
    Task<Client?> GetWithPlanAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Clientes con coordenadas registradas, para pintarlos en el mapa de
    /// cobertura. Solo trae lo que el mapa dibuja, no la ficha completa.
    /// </summary>
    Task<List<ClientMapPoint>> GetWithGpsAsync(CancellationToken ct = default);
}

/// <summary>
/// Proyección mínima de un cliente para el mapa: lo que se pinta y nada más.
/// Vive en Domain porque es la forma del dato que el repositorio devuelve, no un
/// DTO de la API.
/// </summary>
public record ClientMapPoint(
    Guid         Id,
    string       TbnCode,
    string       FullName,
    ClientStatus Status,
    decimal?     GpsLatitude,
    decimal?     GpsLongitude);
