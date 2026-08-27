using MediatR;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Tickets.Queries;

public record GetSlaAlertsQuery : IRequest<SlaAlertsDto>;

public class GetSlaAlertsHandler : IRequestHandler<GetSlaAlertsQuery, SlaAlertsDto>
{
    private readonly ITicketRepository _ticketRepo;

    public GetSlaAlertsHandler(ITicketRepository ticketRepo) => _ticketRepo = ticketRepo;

    public async Task<SlaAlertsDto> Handle(GetSlaAlertsQuery _, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var tickets = await _ticketRepo.GetSlaTrackedAsync(ct);

        var breached  = new List<SlaAlertItemDto>();
        var warning   = new List<SlaAlertItemDto>();
        var attention = new List<SlaAlertItemDto>();

        foreach (var t in tickets)
        {
            var pct   = SlaTrafficLight.PercentElapsed(t.CreatedAt, t.DueDate, now);
            var nivel = SlaTrafficLight.Level(pct);

            // Los que van sobrados no salen en el panel: es una lista de avisos,
            // no el listado de tickets.
            if (nivel == SlaLevel.Ok) continue;

            var item = new SlaAlertItemDto(
                t.Id, t.TicketNumber ?? "", t.Subject,
                t.Priority.ToString(), t.Status.ToString(),
                t.ClientName, t.AssignedToName,
                t.CreatedAt, t.DueDate, pct,
                SlaTrafficLight.Label(nivel));

            switch (nivel)
            {
                case SlaLevel.Breached:  breached.Add(item);  break;
                case SlaLevel.Warning:   warning.Add(item);   break;
                case SlaLevel.Attention: attention.Add(item); break;
            }
        }

        return new SlaAlertsDto(
            breached .OrderByDescending(x => x.PctElapsed),
            warning  .OrderByDescending(x => x.PctElapsed),
            attention.OrderByDescending(x => x.PctElapsed));
    }
}
