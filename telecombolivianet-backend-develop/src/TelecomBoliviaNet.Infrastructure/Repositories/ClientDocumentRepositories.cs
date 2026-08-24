using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Repositories;

/// <summary>Implementación de <see cref="IClientAttachmentRepository"/>. Ver ADR-001.</summary>
public class ClientAttachmentRepository
    : GenericRepository<ClientAttachment>, IClientAttachmentRepository
{
    private readonly AppDbContext _db;

    public ClientAttachmentRepository(AppDbContext db) : base(db) => _db = db;

    public Task<List<ClientAttachment>> GetActiveByClientAsync(
        Guid clientId, CancellationToken ct = default)
        => _db.Set<ClientAttachment>().AsNoTracking()
            .Include(a => a.SubidoPor)
            .Where(a => a.ClientId == clientId && !a.IsDeleted)
            .OrderByDescending(a => a.SubidoAt)
            .ToListAsync(ct);

    public Task<int> CountActiveByClientAsync(Guid clientId, CancellationToken ct = default)
        => _db.Set<ClientAttachment>()
            .CountAsync(a => a.ClientId == clientId && !a.IsDeleted, ct);

    public Task<List<ClientAttachment>> GetForClientBetweenAsync(
        Guid clientId, DateTime? from, DateTime? to, CancellationToken ct = default)
        => _db.Set<ClientAttachment>().AsNoTracking()
            .Include(a => a.SubidoPor)
            .Where(a => a.ClientId == clientId
                     && (from == null || a.SubidoAt >= from)
                     && (to   == null || a.SubidoAt <= to))
            .ToListAsync(ct);
}

/// <summary>Implementación de <see cref="IClientQrRepository"/>. Ver ADR-001.</summary>
public class ClientQrRepository : GenericRepository<ClientQr>, IClientQrRepository
{
    private readonly AppDbContext _db;

    public ClientQrRepository(AppDbContext db) : base(db) => _db = db;

    // Sin AsNoTracking: quien pide el QR activo es para desactivarlo o marcarlo
    // como avisado, así que la entidad tiene que venir rastreada.
    public Task<ClientQr?> GetActiveAsync(Guid clientId, CancellationToken ct = default)
        => _db.Set<ClientQr>()
            .FirstOrDefaultAsync(q => q.ClientId == clientId && q.IsActive, ct);

    public Task<ClientQr?> GetActiveValidAsync(
        Guid clientId, DateTime now, CancellationToken ct = default)
        => _db.Set<ClientQr>().AsNoTracking()
            .Include(q => q.Client)
            .Where(q => q.ClientId == clientId
                     && q.IsActive
                     && (q.ExpiresAt == null || q.ExpiresAt.Value > now))
            .OrderByDescending(q => q.UploadedAt)
            .FirstOrDefaultAsync(ct);

    public Task<List<ClientQr>> GetExpiredAsync(DateTime now, CancellationToken ct = default)
        => _db.Set<ClientQr>()
            .Where(q => q.IsActive && q.ExpiresAt.HasValue && q.ExpiresAt.Value <= now)
            .ToListAsync(ct);

    public Task<List<ClientQr>> GetHistoryAsync(Guid clientId, CancellationToken ct = default)
        => _db.Set<ClientQr>().AsNoTracking()
            .Where(q => q.ClientId == clientId)
            .OrderByDescending(q => q.UploadedAt)
            .ToListAsync(ct);

    public Task<List<ClientQr>> GetExpiringSoonAsync(
        DateTime now, DateTime alertDate, CancellationToken ct = default)
        => _db.Set<ClientQr>().AsNoTracking()
            .Include(q => q.Client)
            .Where(q => q.IsActive
                     && !q.AlertSent
                     && q.ExpiresAt.HasValue
                     && q.ExpiresAt.Value <= alertDate
                     && q.ExpiresAt.Value > now)
            .ToListAsync(ct);
}
