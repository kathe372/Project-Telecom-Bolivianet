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
}
