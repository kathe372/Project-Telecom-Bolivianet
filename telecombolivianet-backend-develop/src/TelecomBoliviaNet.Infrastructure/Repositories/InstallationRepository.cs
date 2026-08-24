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

    public Task<Installation?> GetForCommandAsync(Guid id, CancellationToken ct = default)
        => _db.Installations
            .Include(i => i.Client)
            .Include(i => i.Plan)
            .Include(i => i.Ticket)
            .Include(i => i.Technicians)
            .FirstOrDefaultAsync(i => i.Id == id, ct);

    /// <summary>
    /// Reprogramada entra en el filtro de forma defensiva: quedan filas antiguas
    /// sin normalizar a Pendiente.
    /// </summary>
    private static readonly InstallationStatus[] EstadosAbiertos =
    [
        InstallationStatus.Pendiente,
        InstallationStatus.EnProceso,
        InstallationStatus.Reprogramada,
    ];

    public Task<bool> HasOpenForClientAsync(Guid clientId, CancellationToken ct = default)
        => _db.Installations.AnyAsync(
            i => i.ClientId == clientId && EstadosAbiertos.Contains(i.Status), ct);

    public Task<bool> HasOpenForProspectAsync(string prospectPhone, CancellationToken ct = default)
        => _db.Installations.AnyAsync(
            i => i.ClientId == null
              && i.ProspectPhone == prospectPhone
              && EstadosAbiertos.Contains(i.Status), ct);
}
