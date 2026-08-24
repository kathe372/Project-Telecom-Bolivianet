using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Repositories;

/// <summary>Implementación de <see cref="ITicketRepository"/>. Ver ADR-001.</summary>
public class TicketRepository : GenericRepository<SupportTicket>, ITicketRepository
{
    private readonly AppDbContext _db;

    public TicketRepository(AppDbContext db) : base(db) => _db = db;

    public Task<Guid?> GetAssignedUserIdAsync(Guid ticketId, CancellationToken ct = default)
        => _db.SupportTickets.AsNoTracking()
            .Where(t => t.Id == ticketId)
            .Select(t => (Guid?)t.AssignedToUserId)
            .FirstOrDefaultAsync(ct);
}

/// <summary>Implementación de <see cref="IAuditLogRepository"/>. Ver ADR-001.</summary>
public class AuditLogRepository : GenericRepository<AuditLog>, IAuditLogRepository
{
    private readonly AppDbContext _db;

    public AuditLogRepository(AppDbContext db) : base(db) => _db = db;

    public Task<List<AuditLog>> GetRecentByEntityAsync(
        Guid entityId, string module, int take, CancellationToken ct = default)
        => _db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityId == entityId && a.Module == module)
            .OrderByDescending(a => a.CreatedAt)
            .Take(take)
            .ToListAsync(ct);
}
