using MediatR;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Tickets.Queries;

/// <summary>
/// PASO 16 Fase A: cuenta tickets PREVIOS de un cliente, de un tipo específico,
/// dentro de una ventana de días — usado por el chatbot para decidir si un
/// reclamo es "recurrente" (mismo tipo de problema, ya reportado antes) y debe
/// saltar el autodiagnóstico. El filtro va en la consulta, no se trae la lista
/// completa del historial para filtrar en el llamador (ver GetTicketsByClientQuery,
/// que sí trae todo — a propósito no se reutiliza acá).
/// </summary>
public record CountRecentClientTicketsQuery(
    Guid ClientId, TicketType Type, int SinceDays) : IRequest<int>;

public class CountRecentClientTicketsHandler
    : IRequestHandler<CountRecentClientTicketsQuery, int>
{
    private const int DefaultWindowDays = 30;

    private readonly IGenericRepository<SupportTicket>  _ticketRepo;
    private readonly IGenericRepository<SystemConfig>   _configRepo;

    public CountRecentClientTicketsHandler(
        IGenericRepository<SupportTicket> ticketRepo,
        IGenericRepository<SystemConfig>  configRepo)
    {
        _ticketRepo = ticketRepo;
        _configRepo = configRepo;
    }

    public async Task<int> Handle(CountRecentClientTicketsQuery q, CancellationToken ct)
    {
        var cfg = await _configRepo.FirstOrDefaultAsync(
            c => c.Key == SystemConfigKeys.SupportRecurrentWindowDays);
        var windowDays = int.TryParse(cfg?.Value, out var d) && d > 0 ? d : DefaultWindowDays;

        // El propio q.SinceDays permite al llamador pedir una ventana puntual
        // distinta a la configurada; si no la pasa (<= 0), se usa la de SystemConfig.
        var days = q.SinceDays > 0 ? q.SinceDays : windowDays;
        var since = DateTime.UtcNow.AddDays(-days);

        return await _ticketRepo.CountAsync(t =>
            t.ClientId == q.ClientId &&
            t.Type     == q.Type &&
            t.CreatedAt >= since);
    }
}
