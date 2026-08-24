using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Domain.Services;

public static class InvoiceDomainService
{

    public static (decimal CreditoAplicado, decimal CreditoRestante)
        ApplyCredit(decimal creditoDisponible, decimal montoPendiente)
    {
        if (creditoDisponible <= 0 || montoPendiente <= 0)
            return (0m, creditoDisponible);

        var aplicar = Math.Min(creditoDisponible, montoPendiente);
        return (aplicar, creditoDisponible - aplicar);
    }


    public static InvoiceStatus CalculateStatus(decimal amount, decimal amountPaid)
    {
        // D-17: una factura sin importe no tiene nada que cobrar, así que está
        // saldada. Antes la primera comprobación era `amountPaid <= 0`, de modo
        // que una factura de importe 0 quedaba Emitida para siempre — y Emitida
        // está en OverdueEligible, así que el job de vencimiento acababa
        // marcándola Vencida con deuda 0.
        if (amount <= 0)          return InvoiceStatus.Pagada;

        if (amountPaid <= 0)      return InvoiceStatus.Emitida;
        if (amountPaid >= amount) return InvoiceStatus.Pagada;
        return InvoiceStatus.ParcialmentePagada;
    }

    public static InvoiceStatus EstadoInicialConCredito(decimal amount, decimal creditoAplicado)
    {
        if (creditoAplicado >= amount) return InvoiceStatus.Pagada;
        if (creditoAplicado > 0)       return InvoiceStatus.ParcialmentePagada;
        return InvoiceStatus.Emitida;
    }


    /// <summary>
    /// Estados desde los que una factura puede pasar a <see cref="InvoiceStatus.Vencida"/>
    /// al cruzar su fecha de vencimiento.
    ///
    /// <c>ParcialmentePagada</c> faltaba: una factura abonada a medias nunca vencía, así que
    /// nunca disparaba el aviso de mora ni entraba en la auto-suspensión (ambos filtran por
    /// <c>Status == Vencida</c>). Bastaba con pagar Bs. 1 de cada factura para quedar fuera de
    /// todo el circuito de cobranza. "Vencida" describe el vencimiento, no la ausencia total
    /// de pagos: cuánto se abonó sigue vivo en <c>AmountPaid</c> y <see cref="OutstandingAmount"/>.
    ///
    /// Invariante: <c>OverdueEligible ⊆ UnpaidStatuses</c> — solo puede vencer lo que se debe.
    /// </summary>
    public static readonly InvoiceStatus[] OverdueEligible =
    [
        InvoiceStatus.Pendiente,
        InvoiceStatus.Emitida,
        InvoiceStatus.Enviada,
        InvoiceStatus.ParcialmentePagada,
    ];


    /// <summary>
    /// FUENTE ÚNICA DE VERDAD: estados en los que una factura representa dinero
    /// pendiente de cobro.
    ///
    /// Antes cada consumidor decidía por su cuenta (unos miraban solo
    /// Pendiente|Vencida, otros añadían Emitida|Enviada, y ParcialmentePagada no
    /// figuraba en ninguno). Como una factura recién generada nace en Emitida y no
    /// pasa a Vencida hasta que vence, el bot reportaba deuda cero durante los
    /// primeros días de cada mes y se negaba a enviar el QR de pago.
    ///
    /// Toda consulta de deuda debe usar esta lista. En consultas EF hay que usar
    /// <c>UnpaidStatuses.Contains(i.Status)</c> (se traduce a <c>IN (...)</c>);
    /// <see cref="IsUnpaid"/> y <see cref="OutstandingAmount"/> solo son válidos
    /// en memoria.
    /// </summary>
    public static readonly InvoiceStatus[] UnpaidStatuses =
    [
        InvoiceStatus.Pendiente,
        InvoiceStatus.Emitida,
        InvoiceStatus.Enviada,
        InvoiceStatus.Vencida,
        InvoiceStatus.ParcialmentePagada,
    ];

    /// <summary>¿Este estado representa una factura con saldo por cobrar?</summary>
    public static bool IsUnpaid(InvoiceStatus status) => UnpaidStatuses.Contains(status);

    /// <summary>
    /// Saldo realmente pendiente de una factura. Descuenta lo ya abonado, de modo
    /// que una factura parcialmente pagada aporta solo su remanente y no su total.
    /// </summary>
    public static decimal OutstandingAmount(Invoice invoice)
        => IsUnpaid(invoice.Status) ? invoice.Amount - invoice.AmountPaid : 0m;


    /// <summary>
    /// Transiciones válidas del ciclo de vida de una factura.
    ///
    /// <c>Vencida</c> dejó de ser un callejón sin salida: al admitirse que una factura
    /// <c>ParcialmentePagada</c> venza (ver <see cref="OverdueEligible"/>), tiene que poder
    /// saldarse después — antes solo permitía Anulada, de modo que cobrar el remanente de una
    /// factura vencida era una transición "inválida" y el endpoint manual la rechazaba.
    /// </summary>
    private static readonly Dictionary<InvoiceStatus, InvoiceStatus[]> _transiciones = new()
    {
        [InvoiceStatus.Emitida]            = [InvoiceStatus.Enviada, InvoiceStatus.Pendiente, InvoiceStatus.Vencida, InvoiceStatus.Anulada],
        [InvoiceStatus.Enviada]            = [InvoiceStatus.Pendiente, InvoiceStatus.Vencida, InvoiceStatus.Anulada],
        [InvoiceStatus.Pendiente]          = [InvoiceStatus.Vencida, InvoiceStatus.Anulada],
        [InvoiceStatus.Vencida]            = [InvoiceStatus.ParcialmentePagada, InvoiceStatus.Pagada, InvoiceStatus.Anulada],
        [InvoiceStatus.ParcialmentePagada] = [InvoiceStatus.Vencida, InvoiceStatus.Pagada, InvoiceStatus.Anulada],
        [InvoiceStatus.Pagada]             = [],
        [InvoiceStatus.Anulada]            = [],
    };

    public static bool TransicionEsValida(InvoiceStatus actual, InvoiceStatus nuevo)
        => _transiciones.TryGetValue(actual, out var permitidas)
        && permitidas.Contains(nuevo);

    public static InvoiceStatus[] GetTransicionesPermitidas(InvoiceStatus actual)
        => _transiciones.TryGetValue(actual, out var p) ? p : [];
}
