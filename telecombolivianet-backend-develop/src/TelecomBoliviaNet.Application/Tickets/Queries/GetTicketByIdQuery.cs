using MediatR;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Tickets.Services;

namespace TelecomBoliviaNet.Application.Tickets.Queries;

public record GetTicketByIdQuery(Guid TicketId) : IRequest<TicketDetailDto?>;

public class GetTicketByIdHandler : IRequestHandler<GetTicketByIdQuery, TicketDetailDto?>
{
    private readonly TicketDetailBuilder _detalle;

    public GetTicketByIdHandler(TicketDetailBuilder detalle) => _detalle = detalle;

    public Task<TicketDetailDto?> Handle(GetTicketByIdQuery q, CancellationToken ct)
        => _detalle.ConstruirAsync(q.TicketId);
}
