using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Domain.Entities.Clients;

public enum InvoiceType
{
    Mensualidad      = 0,
    Instalacion      = 1,
    Extraordinaria   = 2,
    ProrrataAnterior = 3,
    ProrrataNueva    = 4,
}

public enum InvoiceStatus
{
    Pendiente,
    Pagada,
    Vencida,
    Anulada,
    Emitida,
    Enviada,
    ParcialmentePagada
}

public class Invoice : Entity
{
    public Guid          ClientId  { get; set; }
    public Client?       Client    { get; set; }

    public InvoiceType   Type      { get; set; }
    public InvoiceStatus Status    { get; set; } = InvoiceStatus.Pendiente;

    public int           Year      { get; set; }
    public int           Month     { get; set; }
    public decimal       Amount    { get; set; }

    public DateTime      IssuedAt  { get; set; } = DateTime.UtcNow;
    public DateTime      DueDate   { get; set; }

    public string?       Notes     { get; set; }
    public DateTime?     UpdatedAt { get; set; }

    public string?  InvoiceNumber { get; set; }

    public decimal  CreditApplied { get; set; } = 0m;

    public decimal  AmountPaid    { get; set; } = 0m;

    public bool     IsExtraordinary     { get; set; } = false;
    public string?  ExtraordinaryReason { get; set; }

    public string?  PlanName  { get; set; }
    public decimal? PlanPrice { get; set; }

    /// <summary>
    /// Token de concurrencia optimista (columna de sistema <c>xmin</c> de
    /// PostgreSQL, no requiere migración).
    ///
    /// D-14: sin él, dos cajeros cobrando la misma factura a la vez leían ambos
    /// <c>AmountPaid = 0</c> y el segundo guardado pisaba al primero en silencio.
    /// Quedaban dos pagos registrados y una factura que decía haberse cobrado una
    /// sola vez. La transacción no lo evitaba: con READ COMMITTED ambas leen antes
    /// de que ninguna escriba.
    /// </summary>
    public uint Xmin { get; set; }

    public bool      IsDeleted   { get; set; } = false;
    public DateTime? DeletedAt   { get; set; }
    public Guid?     DeletedById { get; set; }

    public ICollection<PaymentInvoice> PaymentInvoices { get; set; } = new List<PaymentInvoice>();

    /// <summary>
    /// ¿La factura tiene saldo por cobrar? Delega en
    /// <c>InvoiceDomainService.UnpaidStatuses</c> para que exista una sola
    /// definición de "deuda" en todo el sistema. Antes omitía Emitida y Enviada,
    /// por lo que una factura recién generada no contaba como deuda.
    /// </summary>
    public bool IsUnpaid => InvoiceDomainService.IsUnpaid(Status);

    /// <summary>Saldo pendiente de esta factura (total menos lo ya abonado).</summary>
    public decimal Outstanding => InvoiceDomainService.OutstandingAmount(this);

    // ── Transiciones de estado (E-04) ───────────────────────────────────────
    //
    // La tabla de InvoiceDomainService dice qué cambios de estado son legales, y
    // hasta ahora solo la consultaba el endpoint MANUAL de cambio de estado. Las
    // seis transiciones automáticas —cobrar, aplicar crédito, marcar enviada,
    // vencer, anular— asignaban `Status` a mano sin preguntarle nada a nadie.
    //
    // Por eso pasó inadvertido durante meses que la tabla prohibía
    // `Emitida -> Pagada`, que es lo que ocurre cada vez que alguien paga a
    // tiempo: la misma transición era legal por el camino automático e ilegal por
    // el manual.
    //
    // Estos métodos son el único sitio por el que se cambia el estado, y todos
    // pasan por la tabla. El `set` sigue siendo público a propósito: hacerlo
    // privado obligaría a tocar los seis sitios a la vez, y este paso quiere ser
    // reversible. La regla se aplica a quien la use.

    /// <summary>
    /// Cambia el estado comprobando que la transición sea legal.
    /// </summary>
    /// <exception cref="InvalidOperationException">Si la tabla no la permite.</exception>
    public void CambiarEstadoA(InvoiceStatus nuevo)
    {
        if (nuevo == Status) return;

        if (!InvoiceDomainService.TransicionEsValida(Status, nuevo))
            throw new InvalidOperationException(
                $"Transición de factura no válida: {Status} → {nuevo}. " +
                $"Permitidas: {string.Join(", ", InvoiceDomainService.GetTransicionesPermitidas(Status))}.");

        Status    = nuevo;
        UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Registra cuánto se lleva abonado y deja el estado que le corresponde.
    /// </summary>
    /// <remarks>
    /// El estado NO se elige: lo calcula <c>InvoiceDomainService.CalculateStatus</c>
    /// a partir del importe y lo abonado. Ésa es la puerta por la que volvería
    /// D-17 —una factura de importe 0 que se quedaba Emitida para siempre y
    /// acababa marcada Vencida con deuda cero— si alguien volviera a fijar el
    /// estado por su cuenta.
    ///
    /// <para><b>No pasa por la tabla de transiciones, y es deliberado.</b> Esa
    /// tabla gobierna el cambio de estado MANUAL, donde llegar a <c>Pagada</c>
    /// está prohibido a propósito: un administrador no puede declarar pagada una
    /// factura sin un pago detrás. Aquí sí hay pago —el importe es el argumento—,
    /// así que la restricción no aplica. Cobrar no es un cambio de estado
    /// arbitrario: es otra operación, con su propio requisito.</para>
    /// </remarks>
    public void RegistrarAbono(decimal totalAbonado)
    {
        if (totalAbonado < 0)
            throw new ArgumentOutOfRangeException(nameof(totalAbonado),
                "Lo abonado no puede ser negativo.");

        if (Status == InvoiceStatus.Anulada)
            throw new InvalidOperationException(
                "No se puede abonar una factura anulada.");

        AmountPaid = totalAbonado;
        Status     = InvoiceDomainService.CalculateStatus(Amount, AmountPaid);
        UpdatedAt  = DateTime.UtcNow;
    }

    /// <summary>Suma un abono al que ya hubiera y recalcula el estado.</summary>
    public void Abonar(decimal monto) => RegistrarAbono(AmountPaid + monto);
}
