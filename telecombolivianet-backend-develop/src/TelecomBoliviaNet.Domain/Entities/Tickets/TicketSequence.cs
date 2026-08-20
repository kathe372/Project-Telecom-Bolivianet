namespace TelecomBoliviaNet.Domain.Entities.Tickets;

public class TicketSequence
{
    public int Id        { get; set; } = 1;
    public int Year      { get; set; }
    public int LastValue { get; set; } = 0;
}
