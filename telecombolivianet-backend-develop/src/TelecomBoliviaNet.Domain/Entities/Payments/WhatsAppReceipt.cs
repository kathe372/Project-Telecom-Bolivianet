using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Payments;

public enum ReceiptQueueStatus
{
    Pendiente,
    Aprobado,
    Rechazado,
    NoCorresponde
}

public class WhatsAppReceipt : Entity
{
    public Guid?               ClientId     { get; set; }
    public Client?             Client       { get; set; }

    public string              ImageUrl     { get; set; } = string.Empty;

    public string?             MessageText  { get; set; }

    public decimal?            DeclaredAmount { get; set; }

    public ReceiptQueueStatus  Status       { get; set; } = ReceiptQueueStatus.Pendiente;

    public DateTime            ReceivedAt   { get; set; } = DateTime.UtcNow;
    public DateTime?           ProcessedAt  { get; set; }

    public Guid?               PaymentId    { get; set; }

    public string?             RejectionNote { get; set; }

    public string?             PhoneNumber   { get; set; }
}
