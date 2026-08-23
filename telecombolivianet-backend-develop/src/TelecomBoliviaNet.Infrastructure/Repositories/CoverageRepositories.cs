using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Repositories;

/// <summary>
/// Implementación de <see cref="IDistributionBoxRepository"/>.
///
/// Aquí SÍ vive EF Core: es la capa de infraestructura, su sitio natural. Lo que
/// la Fase 4 persigue es que no viva también en los casos de uso.
/// </summary>
public class DistributionBoxRepository
    : GenericRepository<DistributionBox>, IDistributionBoxRepository
{
    private readonly AppDbContext _db;

    public DistributionBoxRepository(AppDbContext db) : base(db) => _db = db;

    public Task<List<DistributionBox>> GetWithZoneAsync(
        Guid? zoneId = null, DistributionBoxStatus? status = null, CancellationToken ct = default)
    {
        var q = _db.DistributionBoxes.AsNoTracking().Include(b => b.Zone).AsQueryable();

        if (zoneId.HasValue) q = q.Where(b => b.ZoneId  == zoneId.Value);
        if (status.HasValue) q = q.Where(b => b.Estado  == status.Value);

        return q.ToListAsync(ct);
    }

    public async Task<Dictionary<Guid, int>> CountActiveByZoneAsync(CancellationToken ct = default)
    {
        var counts = await _db.DistributionBoxes.AsNoTracking()
            .Where(b => b.Estado == DistributionBoxStatus.Activo)
            .GroupBy(b => b.ZoneId)
            .Select(g => new { ZoneId = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        return counts.ToDictionary(x => x.ZoneId, x => x.Count);
    }
}
