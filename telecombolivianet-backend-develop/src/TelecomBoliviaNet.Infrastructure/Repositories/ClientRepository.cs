using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Repositories;

/// <summary>Implementación de <see cref="IClientRepository"/>. Ver ADR-001.</summary>
public class ClientRepository : GenericRepository<Client>, IClientRepository
{
    private readonly AppDbContext _db;

    public ClientRepository(AppDbContext db) : base(db) => _db = db;

    public Task<Client?> GetWithPlanAsync(Guid id, CancellationToken ct = default)
        => _db.Clients.Include(c => c.Plan).FirstOrDefaultAsync(c => c.Id == id, ct);

    public Task<List<ClientMapPoint>> GetWithGpsAsync(CancellationToken ct = default)
        => _db.Clients.AsNoTracking()
            .Where(c => c.GpsLatitude != null && c.GpsLongitude != null)
            .Select(c => new ClientMapPoint(
                c.Id, c.TbnCode, c.FullName, c.Status, c.GpsLatitude, c.GpsLongitude))
            .ToListAsync(ct);
}
