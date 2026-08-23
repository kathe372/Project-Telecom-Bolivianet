using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Repositories;

/// <summary>Implementación de <see cref="IInstallationRepository"/>. Ver ADR-001.</summary>
public class InstallationRepository : GenericRepository<Installation>, IInstallationRepository
{
    private readonly AppDbContext _db;

    public InstallationRepository(AppDbContext db) : base(db) => _db = db;

    public async Task<Dictionary<Guid, string>> GetLatestBoxCodeByClientAsync(
        CancellationToken ct = default)
    {
        var pares = await _db.Installations.AsNoTracking()
            .Where(i => i.Status == InstallationStatus.Completada
                     && i.DistributionBoxId != null
                     && i.ClientId != null)
            .Include(i => i.DistributionBox)
            .GroupBy(i => i.ClientId!.Value)
            .Select(g => new
            {
                ClientId  = g.Key,
                BoxCodigo = g.OrderByDescending(i => i.CreadoAt)
                             .Select(i => i.DistributionBox!.Codigo)
                             .First(),
            })
            .ToListAsync(ct);

        return pares.ToDictionary(x => x.ClientId, x => x.BoxCodigo);
    }
}
