using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Repositories;

/// <summary>Implementación de <see cref="INotifLogRepository"/>. Ver ADR-001.</summary>
public class NotifLogRepository : GenericRepository<NotifLog>, INotifLogRepository
{
    private readonly AppDbContext _db;

    public NotifLogRepository(AppDbContext db) : base(db) => _db = db;

    public Task<List<NotifLog>> GetForClientBetweenAsync(
        Guid clientId, DateTime? from, DateTime? to, CancellationToken ct = default)
        => _db.NotifLogs.AsNoTracking()
            .Where(n => n.ClienteId == clientId
                     && (from == null || n.RegistradoAt >= from)
                     && (to   == null || n.RegistradoAt <= to))
            .ToListAsync(ct);
}

/// <summary>Implementación de <see cref="IPlanChangeRequestRepository"/>. Ver ADR-001.</summary>
public class PlanChangeRequestRepository
    : GenericRepository<PlanChangeRequest>, IPlanChangeRequestRepository
{
    private readonly AppDbContext _db;

    public PlanChangeRequestRepository(AppDbContext db) : base(db) => _db = db;

    // Sin AsNoTracking: quien pide esto va a resolver la solicitud.
    public Task<PlanChangeRequest?> GetForCommandAsync(Guid id, CancellationToken ct = default)
        => _db.PlanChangeRequests
            .Include(r => r.Client).ThenInclude(c => c!.Plan)
            .Include(r => r.NewPlan)
            .FirstOrDefaultAsync(r => r.Id == id, ct);

    public Task<List<PlanChangeRequest>> GetPendingAsync(
        Guid? clientId = null, CancellationToken ct = default)
    {
        var q = _db.PlanChangeRequests.AsNoTracking()
            .Include(r => r.Client)
            .Include(r => r.OldPlan)
            .Include(r => r.NewPlan)
            .Where(r => r.Status == PlanChangeStatus.Pendiente);

        if (clientId.HasValue) q = q.Where(r => r.ClientId == clientId.Value);

        return q.OrderBy(r => r.RequestedAt).ToListAsync(ct);
    }

    public Task<List<PlanChangeRequest>> GetHistoryForClientAsync(
        Guid clientId, CancellationToken ct = default)
        => _db.PlanChangeRequests.AsNoTracking()
            .Include(r => r.OldPlan)
            .Include(r => r.NewPlan)
            .Where(r => r.ClientId == clientId)
            .OrderByDescending(r => r.RequestedAt)
            .ToListAsync(ct);

    public Task<List<PlanChangeRequest>> GetForClientBetweenAsync(
        Guid clientId, DateTime? from, DateTime? to, CancellationToken ct = default)
        => _db.PlanChangeRequests.AsNoTracking()
            .Include(r => r.OldPlan)
            .Include(r => r.NewPlan)
            .Where(r => r.ClientId == clientId
                     && (from == null || r.RequestedAt >= from)
                     && (to   == null || r.RequestedAt <= to))
            .ToListAsync(ct);
}
