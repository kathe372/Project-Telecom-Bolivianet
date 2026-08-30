using MediatR;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Tickets.Commands;

/// <summary>
/// La calificación que el cliente le pone a la atención, de 1 a 5.
/// </summary>
/// <remarks>
/// D-26 — El chatbot ya recogía esto, pero lo mandaba a <c>RootCause</c> como
/// texto ("CSAT: 4/5 — Buena"). Ese campo es el análisis de causa raíz del
/// técnico y se sobrescribe entero, así que cada calificación **borraba** ese
/// análisis. Y el número quedaba en prosa: imposible sacar un promedio.
///
/// <para>Las columnas para guardarlo bien existían en la base desde 2026-05 y
/// nadie las mapeaba — figuraban como huérfanas en D-04.</para>
/// </remarks>
public record RecordCsatCommand(Guid TicketId, int Score) : IRequest<Result>;

public class RecordCsatHandler : IRequestHandler<RecordCsatCommand, Result>
{
    private readonly IGenericRepository<SupportTicket> _repo;

    public RecordCsatHandler(IGenericRepository<SupportTicket> repo) => _repo = repo;

    public async Task<Result> Handle(RecordCsatCommand cmd, CancellationToken ct)
    {
        if (cmd.Score is < 1 or > 5)
            return Result.Failure("La calificación tiene que estar entre 1 y 5.");

        var ticket = await _repo.GetByIdAsync(cmd.TicketId);
        if (ticket is null) return Result.Failure("Ticket no encontrado.");

        // Se permite recalificar: si alguien manda un segundo número, vale el
        // último. Rechazarlo obligaría al chatbot a explicar por qué no se
        // aceptó una respuesta que la persona acaba de dar.
        ticket.CsatScore       = cmd.Score;
        ticket.CsatRespondedAt = DateTime.UtcNow;

        _repo.Update(ticket);
        await _repo.SaveChangesAsync();

        return Result.Success();
    }
}
