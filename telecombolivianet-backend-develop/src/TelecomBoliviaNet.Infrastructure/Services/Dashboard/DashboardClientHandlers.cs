using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Dashboard.Queries;
using TelecomBoliviaNet.Application.DTOs.Dashboard;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Services.Dashboard;


public class GetUpcomingCutoffsHandler : IRequestHandler<GetUpcomingCutoffsQuery, UpcomingCutoffsDto>
{
    private readonly AppDbContext _db;
    public GetUpcomingCutoffsHandler(AppDbContext db) => _db = db;

    public async Task<UpcomingCutoffsDto> Handle(GetUpcomingCutoffsQuery q, CancellationToken ct)
    {
        var ahora      = DateTime.UtcNow;
        var limiteVista = ahora.AddDays(q.DiasVista);

        var facturas = await _db.Invoices
            .Where(i => !i.IsDeleted
                && i.Status == InvoiceStatus.Pendiente
                && i.DueDate >= ahora
                && i.DueDate <= limiteVista
                && i.Client != null
                && i.Client.Status == ClientStatus.Activo
                && !i.Client.IsDeleted)
            .Select(i => new {
                i.ClientId,
                ClienteNombre = i.Client!.FullName,
                Zona          = i.Client.Zone,
                i.Amount,
                i.DueDate,
                Estado        = i.Status.ToString()
            })
            .ToListAsync(ct);

        var porCliente = facturas
            .GroupBy(f => f.ClientId)
            .Select(g => g.OrderBy(f => f.DueDate).First())
            .Select(f => new ClientUpcomingCutoffDto(
                f.ClientId,
                f.ClienteNombre,
                f.Zona,
                f.Amount,
                (int)(f.DueDate - ahora).TotalDays,
                f.Estado))
            .OrderBy(x => x.DiasParaCorte)
            .ToList();

        return new UpcomingCutoffsDto(porCliente.Count, porCliente);
    }
}


public class GetTechniciansWorkloadHandler : IRequestHandler<GetTechniciansWorkloadQuery, TechniciansWorkloadDto>
{
    private readonly AppDbContext _db;
    public GetTechniciansWorkloadHandler(AppDbContext db) => _db = db;

    public async Task<TechniciansWorkloadDto> Handle(GetTechniciansWorkloadQuery _, CancellationToken ct)
    {
        var now     = DateTime.UtcNow;
        var activos = new[] {
            TicketStatus.Abierto, TicketStatus.EnProceso,
            TicketStatus.PendienteCliente, TicketStatus.EnVisita
        };

        var tickets = await _db.SupportTickets
            .Include(t => t.AssignedTo)
            .Where(t => activos.Contains(t.Status))
            .Select(t => new {
                t.AssignedToUserId,
                TecnicoNombre = t.AssignedTo != null ? t.AssignedTo.FullName : null,
                t.Priority,
                t.Status,
                t.CreatedAt
            })
            .ToListAsync(ct);

        var sinAsignar = tickets.Count(t => t.AssignedToUserId == null);

        var porTecnico = tickets
            .Where(t => t.AssignedToUserId != null)
            .GroupBy(t => t.TecnicoNombre ?? "Desconocido")
            .Select(g => new TechnicianWorkloadDto(
                g.Key,
                g.Count(),
                g.Count(t => t.Priority == TicketPriority.Critica),
                g.Count(t => t.Status == TicketStatus.EnVisita),
                Math.Round(g.Average(t => (now - t.CreatedAt).TotalHours), 1)))
            .OrderByDescending(x => x.TicketsActivos)
            .ToList();

        return new TechniciansWorkloadDto(sinAsignar, porTecnico);
    }
}
