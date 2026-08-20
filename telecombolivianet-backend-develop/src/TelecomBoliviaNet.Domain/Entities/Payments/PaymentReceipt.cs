using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Payments;

public class PaymentReceipt : Entity
{
    public string      ReceiptNumber      { get; set; } = string.Empty;
    public Guid        PaymentId          { get; set; }
    public Payment?    Payment            { get; set; }
    public Guid        ClientId           { get; set; }
    public Client?     Client             { get; set; }
    public Guid        GeneratedByUserId  { get; set; }
    public UserSystem? GeneratedBy        { get; set; }
    public decimal     Amount             { get; set; }
    public string      Method             { get; set; } = string.Empty;
    public string?     Bank               { get; set; }
    public DateTime    PaidAt             { get; set; }
    public string?     InvoiceNumbers     { get; set; }
    public string      PdfPath            { get; set; } = string.Empty;
    public DateTime    GeneratedAt        { get; set; } = DateTime.UtcNow;
    public bool        SentByWhatsApp     { get; set; } = false;
    public DateTime?   SentAt             { get; set; }
}
