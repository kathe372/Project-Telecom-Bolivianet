using TelecomBoliviaNet.Application.DTOs.Tickets;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Tickets;

public class TicketBalancingService
{
    private readonly IGenericRepository<SupportTicket> _ticketRepo;
    private readonly IGenericRepository<UserSystem>    _userRepo;

    public TicketBalancingService(
        IGenericRepository<SupportTicket> ticketRepo,
        IGenericRepository<UserSystem>    userRepo)
    {
        _ticketRepo = ticketRepo;
        _userRepo   = userRepo;
    }

    public async Task<Guid?> GetTechnicianWithLowestLoadAsync(string? preferredGroup = null)
    {
        var tecnicos = await _userRepo.GetAll()
            .AsNoTracking()
            .Where(u => u.Role == UserRole.Tecnico && u.Status == UserStatus.Activo)
            .Select(u => u.Id)
            .ToListAsync();

        if (!tecnicos.Any()) return null;

        var cargaPorTecnico = await _ticketRepo.GetAll()
            .AsNoTracking()
            .Where(t =>
                t.AssignedToUserId.HasValue &&
                tecnicos.Contains(t.AssignedToUserId!.Value) &&
                (t.Status == TicketStatus.Abierto || t.Status == TicketStatus.EnProceso || t.Status == TicketStatus.PendienteCliente))
            .GroupBy(t => t.AssignedToUserId!.Value)
            .Select(g => new { TecnicoId = g.Key, Carga = g.Count() })
            .ToListAsync();

        var cargaMap = cargaPorTecnico.ToDictionary(x => x.TecnicoId, x => x.Carga);
        foreach (var id in tecnicos)
            if (!cargaMap.ContainsKey(id)) cargaMap[id] = 0;

        var menorCarga = cargaMap.OrderBy(kv => kv.Value).First();

        var minCarga  = menorCarga.Value;
        var candidatos = cargaMap.Where(kv => kv.Value == minCarga).Select(kv => kv.Key).ToList();

        if (candidatos.Count == 1) return candidatos[0];

        var ultimaAsignacion = cargaPorTecnico
            .GroupBy(x => x.TecnicoId)
            .Select(g => new { TecnicoId = g.Key, Ultimo = DateTime.MinValue })
            .ToList();
        var lastAssignQuery = await _ticketRepo.GetAll()
            .AsNoTracking()
            .Where(t => t.AssignedToUserId.HasValue && candidatos.Contains(t.AssignedToUserId!.Value))
            .GroupBy(t => t.AssignedToUserId!.Value)
            .Select(g => new { TecnicoId = g.Key, Ultimo = g.Max(t => t.CreatedAt) })
            .ToListAsync();

        var asignMap = lastAssignQuery.ToDictionary(x => x.TecnicoId, x => x.Ultimo);
        foreach (var id in candidatos)
            if (!asignMap.ContainsKey(id)) asignMap[id] = DateTime.MinValue;

        return asignMap.OrderBy(kv => kv.Value).First().Key;
    }

    public async Task<List<TechnicianLoadDto>> GetCargaResumenAsync()
    {
        var tecnicos = await _userRepo.GetAll()
            .AsNoTracking()
            .Where(u => u.Role == UserRole.Tecnico && u.Status == UserStatus.Activo)
            .ToListAsync();

        var tecnicoIds = tecnicos.Select(u => u.Id).ToList();

        var activos = await _ticketRepo.GetAll()
            .AsNoTracking()
            .Where(t => t.AssignedToUserId.HasValue
                     && tecnicoIds.Contains(t.AssignedToUserId!.Value)
                     && (t.Status == TicketStatus.Abierto || t.Status == TicketStatus.EnProceso || t.Status == TicketStatus.PendienteCliente))
            .GroupBy(t => t.AssignedToUserId!.Value)
            .Select(g => new
            {
                Id       = g.Key,
                Total    = g.Count(),
                Criticos = g.Count(t => t.Priority == TicketPriority.Critica)
            })
            .ToListAsync();

        var map = activos.ToDictionary(x => x.Id, x => x);

        return tecnicos
            .Select(t => new TechnicianLoadDto(
                t.Id, t.FullName,
                map.TryGetValue(t.Id, out var m) ? m.Total    : 0,
                map.TryGetValue(t.Id, out var n) ? n.Criticos : 0))
            .OrderBy(x => x.TicketsActivos)
            .ToList();
    }
}


