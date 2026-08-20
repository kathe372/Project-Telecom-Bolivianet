using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Services.Coverage;

/// <summary>
/// Reconcilia el read-model de puertos. La verdad de capacidad sigue en los
/// contadores de la caja; aquí se derivan las filas por puerto (quién/ONU) desde
/// instalaciones completadas + reservas vigentes, preservando los DAÑADOS.
/// </summary>
public class NapPortService : INapPortService
{
    private readonly AppDbContext            _db;
    private readonly ILogger<NapPortService> _logger;

    public NapPortService(AppDbContext db, ILogger<NapPortService> logger)
    {
        _db     = db;
        _logger = logger;
    }

    public async Task<IReadOnlyList<NapPort>> GetBoxPortsAsync(Guid boxId, CancellationToken ct = default)
    {
        await SyncBoxAsync(boxId, ct);
        return await _db.Set<NapPort>().AsNoTracking()
            .Where(p => p.DistributionBoxId == boxId)
            .OrderBy(p => p.Numero)
            .ToListAsync(ct);
    }

    public async Task<bool> MarkDamagedAsync(Guid boxId, int numero, CancellationToken ct = default)
    {
        await SyncBoxAsync(boxId, ct); // asegura que el puerto exista y refleje el estado real

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var box  = await _db.Set<DistributionBox>().FirstOrDefaultAsync(b => b.Id == boxId, ct);
        var port = await _db.Set<NapPort>()
            .FirstOrDefaultAsync(p => p.DistributionBoxId == boxId && p.Numero == numero, ct);

        // Solo se puede dañar un puerto LIBRE: dañar uno ocupado/reservado dejaría
        // a un cliente sin puerto. Y hace falta que la caja exista.
        if (box is null || port is null || port.Status != NapPortStatus.Free)
        {
            await tx.RollbackAsync(ct);
            return false;
        }

        port.Status    = NapPortStatus.Damaged;
        port.UpdatedAt = DateTime.UtcNow;
        box.PuertosTotal -= 1; // el puerto dañado sale de la capacidad usable

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }

    public async Task<bool> RepairAsync(Guid boxId, int numero, CancellationToken ct = default)
    {
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var box  = await _db.Set<DistributionBox>().FirstOrDefaultAsync(b => b.Id == boxId, ct);
        var port = await _db.Set<NapPort>()
            .FirstOrDefaultAsync(p => p.DistributionBoxId == boxId && p.Numero == numero, ct);

        if (box is null || port is null || port.Status != NapPortStatus.Damaged)
        {
            await tx.RollbackAsync(ct);
            return false;
        }

        port.Status    = NapPortStatus.Free;
        port.UpdatedAt = DateTime.UtcNow;
        box.PuertosTotal += 1;

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }

    public async Task SyncAllAsync(CancellationToken ct = default)
    {
        var boxIds = await _db.Set<DistributionBox>().Select(b => b.Id).ToListAsync(ct);
        foreach (var id in boxIds)
        {
            try { await SyncBoxAsync(id, ct); }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "NapPortService: fallo reconciliando caja {BoxId}.", id);
            }
        }
    }

    /// <summary>
    /// Reconstruye las filas NO dañadas de una caja: Used (una por instalación
    /// completada) + Reserved (una por reserva vigente) + Free (el resto de la
    /// capacidad usable). Los DAÑADOS se preservan y conservan su número.
    /// </summary>
    private async Task SyncBoxAsync(Guid boxId, CancellationToken ct)
    {
        var box = await _db.Set<DistributionBox>().FirstOrDefaultAsync(b => b.Id == boxId, ct);
        if (box is null) return;

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var existing = await _db.Set<NapPort>()
            .Where(p => p.DistributionBoxId == boxId).ToListAsync(ct);
        var damaged = existing.Where(p => p.Status == NapPortStatus.Damaged).ToList();

        var used = await _db.Set<Installation>()
            .Where(i => i.DistributionBoxId == boxId && i.Status == InstallationStatus.Completada)
            .Select(i => new { i.Id, i.ClientId, i.EquipoOnuSerial })
            .ToListAsync(ct);

        var reserved = await _db.Set<PortReservation>()
            .Where(r => r.DistributionBoxId == boxId && r.Status == PortReservationStatus.Active)
            .Select(r => r.InstallationId)
            .ToListAsync(ct);

        var now = DateTime.UtcNow;
        var desired = new List<NapPort>();

        foreach (var u in used)
            desired.Add(new NapPort
            {
                DistributionBoxId = boxId, Status = NapPortStatus.Used,
                AccountId = u.ClientId, OnuSerial = u.EquipoOnuSerial,
                InstallationId = u.Id, UpdatedAt = now,
            });

        foreach (var instId in reserved)
            desired.Add(new NapPort
            {
                DistributionBoxId = boxId, Status = NapPortStatus.Reserved,
                InstallationId = instId, UpdatedAt = now,
            });

        // Free = capacidad usable menos lo ya usado/reservado (clamp a 0 si hubo
        // ajustes manuales que sobrepasan el total).
        var freeCount = Math.Max(0, box.PuertosTotal - used.Count - reserved.Count);
        for (var i = 0; i < freeCount; i++)
            desired.Add(new NapPort
            {
                DistributionBoxId = boxId, Status = NapPortStatus.Free, UpdatedAt = now,
            });

        // Numeración: los dañados conservan su número; el resto toma los libres.
        var taken = new HashSet<int>(damaged.Select(d => d.Numero));
        var next = 1;
        foreach (var p in desired)
        {
            while (taken.Contains(next)) next++;
            p.Numero = next;
            taken.Add(next);
            next++;
        }

        // Reemplaza SOLO las filas no dañadas. Se guarda en dos pasos para que los
        // DELETE se apliquen antes que los INSERT (índice único BoxId+Numero).
        _db.Set<NapPort>().RemoveRange(existing.Where(p => p.Status != NapPortStatus.Damaged));
        await _db.SaveChangesAsync(ct);
        await _db.Set<NapPort>().AddRangeAsync(desired, ct);
        await _db.SaveChangesAsync(ct);

        await tx.CommitAsync(ct);
    }
}
