using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Tickets;

public class TicketBalancingService
{
    private readonly ITicketRepository _ticketRepo;
    private readonly IUserRepository   _userRepo;

    public TicketBalancingService(
        ITicketRepository ticketRepo,
        IUserRepository   userRepo)
    {
        _ticketRepo = ticketRepo;
        _userRepo   = userRepo;
    }

    public async Task<Guid?> GetTechnicianWithLowestLoadAsync(string? preferredGroup = null)
    {
        var tecnicos = (await _userRepo.GetActiveTechniciansAsync())
            .Select(u => u.Id)
            .ToList();

        if (tecnicos.Count == 0) return null;

        // El repositorio solo devuelve a quien tiene tickets encima; los demás
        // están a cero, y son justamente los candidatos a recibir el siguiente.
        var carga = await _ticketRepo.GetOpenLoadByTechnicianAsync(tecnicos);
        var cargaMap = tecnicos.ToDictionary(
            id => id,
            id => carga.TryGetValue(id, out var c) ? c.Total : 0);

        var minCarga   = cargaMap.Values.Min();
        var candidatos = cargaMap.Where(kv => kv.Value == minCarga).Select(kv => kv.Key).ToList();

        if (candidatos.Count == 1) return candidatos[0];

        // Empate: se lo lleva quien lleva más tiempo sin recibir uno, para que
        // el reparto rote en vez de caer siempre en el mismo.
        var ultimas = await _ticketRepo.GetLastAssignmentByTechnicianAsync(candidatos);

        return candidatos
            .OrderBy(id => ultimas.TryGetValue(id, out var fecha) ? fecha : DateTime.MinValue)
            .First();
    }

    public async Task<List<TechnicianLoadDto>> GetCargaResumenAsync()
    {
        var tecnicos = await _userRepo.GetActiveTechniciansAsync();
        var carga    = await _ticketRepo.GetOpenLoadByTechnicianAsync(
            tecnicos.Select(t => t.Id).ToList());

        return tecnicos
            .Select(t =>
            {
                var c = carga.TryGetValue(t.Id, out var encontrada)
                    ? encontrada
                    : new TechnicianLoad(0, 0);
                return new TechnicianLoadDto(t.Id, t.FullName, c.Total, c.Critical);
            })
            .OrderBy(x => x.TicketsActivos)
            .ToList();
    }
}
