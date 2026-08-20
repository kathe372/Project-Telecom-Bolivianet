using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Services.Coverage;

/// <summary>
/// Reserva de puerto NAP atómica. El <c>SELECT … FOR UPDATE</c> sobre la fila de
/// la caja serializa a dos agendamientos que compiten por el último puerto: el
/// segundo espera al commit del primero y re-lee <c>PuertosReservados</c> ya
/// actualizado, de modo que <c>Reservar()</c> vuelve a validar capacidad real.
/// </summary>
public class PortReservationStore : IPortReservationStore
{
    private const string LockBoxSql =
        "SELECT * FROM \"DistributionBoxes\" WHERE \"Id\" = {0} FOR UPDATE";

    private readonly AppDbContext _db;

    public PortReservationStore(AppDbContext db) => _db = db;

    public async Task<Guid?> TryReserveAsync(
        Guid boxId, Guid installationId, TimeSpan ttl, CancellationToken ct = default)
    {
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var box = await LockBoxAsync(boxId, ct);
        if (box is null) { await tx.RollbackAsync(ct); return null; }

        try
        {
            box.Reservar();
        }
        catch (DomainException)
        {
            await tx.RollbackAsync(ct);
            return null; // se llenó entre el check y la reserva
        }

        var now = DateTime.UtcNow;
        await _db.Set<PortReservation>().AddAsync(new PortReservation
        {
            DistributionBoxId = boxId,
            InstallationId    = installationId,
            ReservedAt        = now,
            ExpiresAt         = now.Add(ttl),
            Status            = PortReservationStatus.Active,
        }, ct);

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return box.ZoneId;
    }

    public async Task ReleaseByInstallationAsync(
        Guid installationId, Guid boxId, CancellationToken ct = default)
    {
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var box = await LockBoxAsync(boxId, ct);
        box?.LiberarReserva(); // idempotente aunque no haya reservas (legacy)

        var reservation = await _db.Set<PortReservation>().FirstOrDefaultAsync(
            r => r.InstallationId == installationId
              && r.Status == PortReservationStatus.Active, ct);
        if (reservation is not null)
            reservation.Status = PortReservationStatus.Cancelled;

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task<int> ExpireDueAsync(DateTime now, CancellationToken ct = default)
    {
        var due = await _db.Set<PortReservation>()
            .Where(r => r.Status == PortReservationStatus.Active && r.ExpiresAt < now)
            .ToListAsync(ct);

        var expired = 0;
        foreach (var reservation in due)
        {
            await using var tx = await _db.Database.BeginTransactionAsync(ct);

            var inst = await _db.Set<Installation>()
                .FirstOrDefaultAsync(i => i.Id == reservation.InstallationId, ct);

            if (inst is not null && inst.Status == InstallationStatus.Completada)
            {
                // El puerto ya pasó a ocupado al completar: solo cerramos la fila.
                reservation.Status = PortReservationStatus.Converted;
            }
            else
            {
                var box = await LockBoxAsync(reservation.DistributionBoxId, ct);
                box?.LiberarReserva();
                if (inst is not null && inst.DistributionBoxId == reservation.DistributionBoxId)
                    inst.DistributionBoxId = null;
                reservation.Status = PortReservationStatus.Expired;
                expired++;
            }

            await _db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        return expired;
    }

    private async Task<DistributionBox?> LockBoxAsync(Guid boxId, CancellationToken ct)
        => (await _db.Set<DistributionBox>()
                .FromSqlRaw(LockBoxSql, boxId)
                .ToListAsync(ct))
            .FirstOrDefault();
}
