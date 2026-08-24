using MediatR;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Tickets.Queries;

/// <summary>
/// Proyección mínima (solo AssignedToUserId) para el chequeo de permisos "¿este
/// técnico puede actuar sobre este ticket?" — evita cargar el detalle completo
/// (comentarios/horas/visitas) solo para verificar la asignación.
/// </summary>
public record GetTicketOwnerQuery(Guid TicketId) : IRequest<Guid?>;

public class GetTicketOwnerHandler : IRequestHandler<GetTicketOwnerQuery, Guid?>
{
    private readonly ITicketRepository _repo;

    public GetTicketOwnerHandler(ITicketRepository repo) => _repo = repo;

    public async Task<Guid?> Handle(GetTicketOwnerQuery q, CancellationToken ct) =>
        await _repo.GetAssignedUserIdAsync(q.TicketId, ct);
}
