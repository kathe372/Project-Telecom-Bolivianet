using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Repositories;

/// <summary>Implementación de <see cref="ITicketVisitRepository"/>. Ver ADR-001.</summary>
public class TicketVisitRepository : GenericRepository<TicketVisit>, ITicketVisitRepository
{
    private readonly AppDbContext _db;

    public TicketVisitRepository(AppDbContext db) : base(db) => _db = db;

    /// <summary>Include común: el ticket con su cliente y el plan de ese cliente.</summary>
    private IQueryable<TicketVisit> ConTicketYCliente()
        => _db.TicketVisits
            .Include(v => v.Ticket).ThenInclude(t => t!.Client).ThenInclude(c => c!.Plan);

    public Task<List<TicketVisit>> GetTechnicianDayAsync(
        Guid tecnicoId, DateTime fecha, CancellationToken ct = default)
        => ConTicketYCliente()
            .Where(v => v.ScheduledAt.Date == fecha.Date
                     && (v.TechnicianId == tecnicoId
                         || v.Technicians.Any(t => t.TechnicianId == tecnicoId))
                     && v.Status != VisitStatus.Cancelada)
            .OrderBy(v => v.ScheduledAt)
            .ToListAsync(ct);

    public Task<List<TicketVisit>> GetCalendarRangeAsync(
        DateTime desde, DateTime hasta, Guid? tecnicoId, CancellationToken ct = default)
    {
        var q = ConTicketYCliente()
            .Where(v => v.ScheduledAt.Date >= desde && v.ScheduledAt.Date <= hasta
                     && v.Status == VisitStatus.Programada
                     && v.Ticket != null
                     && (v.Ticket.Status == TicketStatus.Abierto
                      || v.Ticket.Status == TicketStatus.EnProceso));

        if (tecnicoId.HasValue)
            q = q.Where(v => v.TechnicianId == tecnicoId
                          || v.Technicians.Any(t => t.TechnicianId == tecnicoId));

        return q.OrderBy(v => v.ScheduledAt).ToListAsync(ct);
    }
}
