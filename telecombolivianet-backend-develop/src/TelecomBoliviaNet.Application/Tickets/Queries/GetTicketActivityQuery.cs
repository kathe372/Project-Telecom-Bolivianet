using MediatR;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Tickets.Queries;

public record GetTicketActivityQuery(Guid TicketId) : IRequest<IEnumerable<TicketActivityDto>>;

public class GetTicketActivityHandler : IRequestHandler<GetTicketActivityQuery, IEnumerable<TicketActivityDto>>
{
    private readonly IAuditLogRepository _auditRepo;

    public GetTicketActivityHandler(IAuditLogRepository auditRepo)
        => _auditRepo = auditRepo;

    public async Task<IEnumerable<TicketActivityDto>> Handle(GetTicketActivityQuery query, CancellationToken ct)
    {
        var logs = await _auditRepo.GetRecentByEntityAsync(query.TicketId, "Tickets", 100, ct);

        return logs.Select(a => new TicketActivityDto(
            a.Id, a.Action, a.Description, a.UserName, a.UserId, a.CreatedAt));
    }
}
