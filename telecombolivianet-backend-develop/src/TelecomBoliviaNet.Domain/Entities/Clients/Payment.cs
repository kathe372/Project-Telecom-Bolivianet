using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Clients;

public enum PaymentMethod
{
    Efectivo,
    DepositoBancario,
    QR
}

public class Payment : Entity
{
    public Guid    ClientId        { get; set; }
    public Client? Client          { get; set; }

    public decimal       Amount         { get; set; }
    public PaymentMethod Method         { get; set; }
    public string?       Bank                  { get; set; }
    public string?       BankReference         { get; set; }
    public string?       ReceiptImageUrl        { get; set; }
    public string?       PhysicalReceiptNumber  { get; set; }

    public DateTime      PaidAt         { get; set; }
    public DateTime      RegisteredAt   { get; set; } = DateTime.UtcNow;

    public Guid          RegisteredByUserId { get; set; }
    public UserSystem?   RegisteredBy       { get; set; }

    public bool          FromWhatsApp   { get; set; }

    public ICollection<PaymentInvoice> PaymentInvoices { get; set; } = new List<PaymentInvoice>();

    public bool      IsVoided         { get; set; } = false;
    public string?   VoidJustification { get; set; }
    public DateTime? VoidedAt          { get; set; }
    public Guid?     VoidedByUserId    { get; set; }

    public bool      IsDeleted   { get; set; } = false;
    public DateTime? DeletedAt   { get; set; }
    public Guid?     DeletedById { get; set; }
}

public class PaymentInvoice : Entity
{
    public Guid     PaymentId { get; set; }
    public Payment? Payment   { get; set; }

    public Guid     InvoiceId { get; set; }
    public Invoice? Invoice   { get; set; }

    /// <summary>
    /// Importe de este pago aplicado a esta factura concreta. Un pago puede
    /// repartirse entre varias facturas, así que sin este dato es imposible
    /// revertir la anulación con exactitud.
    ///
    /// <c>null</c> = enlace anterior a la migración 20260801000001, cuyo reparto
    /// real se desconoce. No se rellena con un valor inventado.
    /// </summary>
    public decimal? AmountApplied { get; set; }
}
