using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Consultas de facturación en lenguaje de negocio. Ver ADR-001.
///
/// <para>Crece por demanda: aquí solo están las consultas que hoy usa algún caso
/// de uso. Los informes con filtros dinámicos (InvoiceQueryService) siguen
/// componiendo su propia consulta — son la excepción documentada del ADR.</para>
/// </summary>
public interface IInvoiceRepository : IGenericRepository<Invoice>
{
    /// <summary>
    /// Facturas vigentes de un cliente para un año, más la de instalación (que
    /// no pertenece a ningún año en particular), ordenadas por mes. Las anuladas
    /// quedan fuera: no son deuda ni historial de cobro.
    /// </summary>
    Task<List<Invoice>> GetForClientYearAsync(
        Guid clientId, int year, CancellationToken ct = default);

    /// <summary>
    /// Plan que estaba vigente cuando se emitió cada factura. Lo usa el bot para
    /// explicar por qué el monto de un mes difiere del anterior; el plan ACTUAL
    /// del cliente no sirve para eso.
    /// </summary>
    Task<List<InvoicePlanSnapshot>> GetPlanSnapshotsAsync(
        IReadOnlyCollection<Guid> invoiceIds, CancellationToken ct = default);

    /// <summary>
    /// Facturas emitidas a un cliente dentro de una ventana de fechas — todas,
    /// incluidas las anuladas: la línea de tiempo de su ficha cuenta lo que
    /// pasó, no lo que quedó vigente.
    /// </summary>
    Task<List<Invoice>> GetForClientBetweenAsync(
        Guid clientId, DateTime? from, DateTime? to, CancellationToken ct = default);

    /// <summary>
    /// Un tramo de las facturas que ya deberían estar vencidas, para marcarlas.
    /// Devuelve las de hasta <paramref name="maxClientes"/> clientes con id mayor
    /// que <paramref name="desdeClienteId"/>; se avanza pasando el id del último
    /// cliente del tramo anterior (<see cref="Guid.Empty"/> para empezar).
    /// </summary>
    /// <remarks>
    /// F7.4 — Se pagina por CLIENTE, no por factura, y esto no es un detalle de
    /// eficiencia: el job agrupa las vencidas por cliente para mandarle UN aviso
    /// que dice "3 meses". Si un tramo partiera a un cliente por la mitad,
    /// recibiría dos avisos contradictorios por la misma deuda. Paginando por
    /// cliente, un cliente entra entero en un tramo o no entra.
    ///
    /// <para>Vienen RASTREADAS a propósito: quien las pide es el job que les
    /// cambia el estado.</para>
    /// </remarks>
    Task<List<Invoice>> GetOverdueBatchAsync(
        DateTime asOf, Guid desdeClienteId, int maxClientes, CancellationToken ct = default);
}

/// <summary>Lo que costaba el plan del cliente en el momento de emitir la factura.</summary>
public record InvoicePlanSnapshot(Guid InvoiceId, string? PlanName, decimal? PlanPrice);

/// <summary>Consultas de pagos en lenguaje de negocio. Ver ADR-001.</summary>
public interface IPaymentRepository : IGenericRepository<Payment>
{
    /// <summary>
    /// Historial de pagos de un cliente, del más reciente al más antiguo, con
    /// quién los registró y qué facturas saldó cada uno — que es exactamente lo
    /// que muestra la grilla de cobros de su ficha.
    /// </summary>
    Task<List<Payment>> GetHistoryForClientAsync(
        Guid clientId, CancellationToken ct = default);

    /// <summary>
    /// Pagos vigentes de un cliente dentro de una ventana de fechas, con quién
    /// los registró. Los anulados quedan fuera: en la línea de tiempo figuran
    /// por su asiento de auditoría, no como cobro.
    /// </summary>
    Task<List<Payment>> GetForClientBetweenAsync(
        Guid clientId, DateTime? from, DateTime? to, CancellationToken ct = default);
}
