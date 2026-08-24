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

    public Task<SupportTicket?> GetByIdIgnoringClientFilterAsync(
        Guid id, CancellationToken ct = default)
        => _db.SupportTickets.IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.Id == id, ct);

    public Task<List<SupportTicket>> GetForClientBetweenAsync(
        Guid clientId, DateTime? from, DateTime? to, CancellationToken ct = default)
        => _db.SupportTickets.AsNoTracking()
            .Include(t => t.CreatedBy)
            .Where(t => t.ClientId == clientId
                     && (from == null || t.CreatedAt >= from)
                     && (to   == null || t.CreatedAt <= to))
            .ToListAsync(ct);
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

    public Task<List<AuditLog>> GetForEntityBetweenAsync(
        Guid entityId, DateTime? from, DateTime? to, CancellationToken ct = default)
        => _db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityId == entityId
                     && (from == null || a.CreatedAt >= from)
                     && (to   == null || a.CreatedAt <= to))
            .ToListAsync(ct);
}
