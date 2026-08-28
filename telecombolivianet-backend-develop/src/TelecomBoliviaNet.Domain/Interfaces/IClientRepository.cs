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

    /// <summary>
    /// Cliente con sus facturas cargadas. Lo necesita la baja, que antes de
    /// cancelar comprueba si queda deuda.
    /// </summary>
    Task<Client?> GetWithInvoicesAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Ficha completa de un cliente: plan, quién lo instaló y el historial de
    /// facturas con sus pagos. Null si no existe.
    /// </summary>
    Task<Client?> GetDetailAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Clientes cuyo teléfono principal o secundario coincide con alguno de los
    /// números dados, con plan y facturas cargados, del más antiguo al más nuevo.
    ///
    /// <para>Recibe VARIOS números porque quien llama ya normalizó el que le
    /// llegó (con y sin prefijo 591) y quiere probar ambas formas en una sola
    /// consulta. Puede devolver más de uno: el teléfono no es único, dos
    /// familiares con CIs distintos comparten contacto.</para>
    /// </summary>
    Task<List<Client>> GetByAnyPhoneAsync(
        IReadOnlyCollection<string> phones, CancellationToken ct = default);

    /// <summary>
    /// Página del listado con plan y facturas cargadas, ya filtrada y ordenada.
    /// Sirve tanto a la grilla de Clientes como a la búsqueda avanzada.
    /// </summary>
    Task<(List<Client> Items, int Total)> GetPagedAsync(
        ClientListFilter filter, CancellationToken ct = default);

    /// <summary>
    /// Clientes con al menos una factura vencida y servicio aún vivo (activo o
    /// suspendido), con sus facturas cargadas. Alimenta el recordatorio masivo.
    ///
    /// <para>Los dados de baja quedan fuera por el filtro global: reclamarle una
    /// deuda a quien ya no es cliente se resuelve por otra vía, no por WhatsApp
    /// automático.</para>
    /// </summary>
    /// <summary>
    /// Un tramo de los clientes con facturas vencidas, ordenados por id: los
    /// primeros <paramref name="tamano"/> cuyo id sea mayor que
    /// <paramref name="desdeId"/> (<see cref="Guid.Empty"/> para empezar).
    /// Cada uno trae en <c>Invoices</c> SOLO sus vencidas.
    /// </summary>
    /// <remarks>
    /// F7.4 — Reemplaza a <c>GetWithOverdueInvoicesAsync</c>, que traía a todos
    /// los morosos de golpe y, de cada uno, TODAS sus facturas —incluidas las
    /// pagadas de años anteriores— para quedarse solo con las vencidas.
    ///
    /// <para>Avanzar por id es seguro aquí porque el recordatorio no cambia el
    /// estado de nadie: solo encola avisos. El conjunto no se mueve bajo los pies
    /// del recorrido, al revés que en el job de suspensión.</para>
    /// </remarks>
    Task<List<Client>> GetWithOverdueInvoicesPageAsync(
        Guid desdeId, int tamano, CancellationToken ct = default);
}

/// <summary>
/// Criterios del listado de clientes. Los dos consumidores —la grilla y la
/// búsqueda avanzada— usan subconjuntos distintos, de ahí que todo sea opcional.
/// </summary>
public record ClientListFilter(
    string? Search          = null,
    string? Status          = null,
    Guid?   PlanId          = null,
    string? Zone            = null,
    bool?   HasEmail        = null,
    string? DebtFilter      = null,
    string? SortBy          = null,
    bool    IncludeDeleted  = false,
    int     Page            = 1,
    int     PageSize        = 20);

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
