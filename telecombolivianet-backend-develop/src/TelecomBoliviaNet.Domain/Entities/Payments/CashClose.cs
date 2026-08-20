using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Payments;

public class CashClose : Entity
{
    public Guid        UserId     { get; set; }
    public UserSystem? User       { get; set; }

    public DateTime    StartedAt  { get; set; } = DateTime.UtcNow;
    public DateTime?   ClosedAt   { get; set; }

    public decimal     TotalAmount { get; set; }
    public string      DetailJson  { get; set; } = "[]";

    public int    PagosValidados  { get; set; }
    public int    PagosRechazados { get; set; }
    public string? PdfPath        { get; set; }
}

public record CashCloseChannelDetail(
    string  Method,
    int     Cantidad,
    decimal Monto
);
