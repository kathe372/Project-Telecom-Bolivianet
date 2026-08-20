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
}
