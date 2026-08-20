using TelecomBoliviaNet.Application.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Tickets;

public class TicketNumberService
{
    private readonly ISequenceGenerator _seq;

    public TicketNumberService(ISequenceGenerator seq) => _seq = seq;

    public Task<string> NextAsync() => _seq.NextTicketNumberAsync();
}
