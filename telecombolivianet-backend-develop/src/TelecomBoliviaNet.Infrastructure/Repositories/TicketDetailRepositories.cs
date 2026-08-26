using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Repositories;

/// <summary>Implementación de <see cref="ISlaPlanRepository"/>. Ver ADR-001.</summary>
public class SlaPlanRepository : GenericRepository<SlaPlan>, ISlaPlanRepository
{
    private readonly AppDbContext _db;

    public SlaPlanRepository(AppDbContext db) : base(db) => _db = db;

    public Task<SlaPlan?> GetActiveByPriorityAsync(
        string priority, CancellationToken ct = default)
        => _db.Set<SlaPlan>().AsNoTracking()
            .FirstOrDefaultAsync(p => p.Priority == priority && p.IsActive, ct);
}

/// <summary>Implementación de <see cref="ITicketCommentRepository"/>. Ver ADR-001.</summary>
public class TicketCommentRepository
    : GenericRepository<TicketComment>, ITicketCommentRepository
{
    private readonly AppDbContext _db;

    public TicketCommentRepository(AppDbContext db) : base(db) => _db = db;

    public Task<List<TicketComment>> GetForTicketAsync(
        Guid ticketId, CancellationToken ct = default)
        => _db.Set<TicketComment>().AsNoTracking()
            .Include(c => c.Author)
            .Where(c => c.TicketId == ticketId)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync(ct);
}

/// <summary>Implementación de <see cref="ITicketWorkLogRepository"/>. Ver ADR-001.</summary>
public class TicketWorkLogRepository
    : GenericRepository<TicketWorkLog>, ITicketWorkLogRepository
{
    private readonly AppDbContext _db;

    public TicketWorkLogRepository(AppDbContext db) : base(db) => _db = db;

    public Task<List<TicketWorkLog>> GetForTicketAsync(
        Guid ticketId, CancellationToken ct = default)
        => _db.Set<TicketWorkLog>().AsNoTracking()
            .Include(w => w.User)
            .Where(w => w.TicketId == ticketId)
            .OrderByDescending(w => w.LoggedAt)
            .ToListAsync(ct);
}
