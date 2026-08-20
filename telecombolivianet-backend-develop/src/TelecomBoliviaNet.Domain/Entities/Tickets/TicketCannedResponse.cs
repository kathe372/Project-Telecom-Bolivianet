using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Tickets;

public class TicketCannedResponse : Entity
{
    public string  Title          { get; set; } = string.Empty;
    public string  Body           { get; set; } = string.Empty;
    public string? Category       { get; set; }
    public bool    IsActive       { get; set; } = true;
    public Guid    CreatedByUserId { get; set; }
    public DateTime CreatedAt     { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt    { get; set; }
}
