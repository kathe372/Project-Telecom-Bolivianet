using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Tickets;

public enum NotificationStatus { Enviado, Fallido }
public enum NotificationType   { AsignacionTecnico, AlertaSla, CierreAutomatico, EscalacionSla, VisitaProgramada }

public class TicketNotification : Entity
{
    public Guid               TicketId    { get; set; }
    public SupportTicket?     Ticket      { get; set; }
    public NotificationType   Type        { get; set; }
    public NotificationStatus Status      { get; set; }
    public string             Recipient   { get; set; } = string.Empty;
    public string             Message     { get; set; } = string.Empty;
    public string?            ErrorDetail { get; set; }
    public DateTime           SentAt      { get; set; } = DateTime.UtcNow;
}
