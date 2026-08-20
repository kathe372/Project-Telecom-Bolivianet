namespace TelecomBoliviaNet.Application.DTOs.Bot;


public enum BotEventType
{
    TICKET_ALTA,
    TICKET_CREATED,
    CONVERSATION_ESCALATED,
}

public class BotEventDto
{
    public BotEventType EventType   { get; set; }
    public string       PhoneNumber { get; set; } = string.Empty;
    public string?      ClientName  { get; set; }
    public string?      TicketId    { get; set; }
    public string?      Priority    { get; set; }
    public string?      Reason      { get; set; }
    public string       Timestamp   { get; set; } = string.Empty;
}

public class AdminBotEventPayload
{
    public string  EventType   { get; set; } = string.Empty;
    public string  PhoneNumber { get; set; } = string.Empty;
    public string? ClientName  { get; set; }
    public string? TicketId    { get; set; }
    public string? Priority    { get; set; }
    public string? Reason      { get; set; }
    public string  Timestamp   { get; set; } = string.Empty;
    public string  ReceivedAt  { get; set; } = string.Empty;
}
