using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Tickets;

public enum CommentType
{
    RespuestaCliente,
    NotaInterna,
    CausaRaiz,
}

public class TicketComment : Entity
{
    public Guid          TicketId  { get; set; }
    public SupportTicket? Ticket   { get; set; }
    public Guid          AuthorId  { get; set; }
    public UserSystem?   Author    { get; set; }
    public CommentType   Type      { get; set; } = CommentType.NotaInterna;
    public string        Body      { get; set; } = string.Empty;
    public DateTime      CreatedAt { get; set; } = DateTime.UtcNow;
}
