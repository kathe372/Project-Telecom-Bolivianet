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

    public Task<ClientBoxRef?> GetLatestBoxForClientAsync(
        Guid clientId, CancellationToken ct = default)
        => _db.Installations.AsNoTracking()
            .Where(i => i.ClientId == clientId && i.DistributionBoxId != null)
            .OrderByDescending(i => i.Fecha)
            .Select(i => new ClientBoxRef(i.DistributionBoxId!.Value, i.DistributionBox!.Codigo))
            .FirstOrDefaultAsync(ct);

    public Task<Installation?> GetByTicketAsync(Guid ticketId, CancellationToken ct = default)
        => _db.Installations.AsNoTracking()
            .Include(i => i.DistributionBox).ThenInclude(b => b!.Zone)
            .FirstOrDefaultAsync(i => i.TicketId == ticketId, ct);

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

    public Task<Installation?> GetDetailAsync(Guid id, CancellationToken ct = default)
        => _db.Installations
            .Include(i => i.Client)
            .Include(i => i.Plan)
            .Include(i => i.Tecnico)
            .Include(i => i.DistributionBox)
            .Include(i => i.Technicians).ThenInclude(t => t.Technician)
            .FirstOrDefaultAsync(i => i.Id == id, ct);

    /// <summary>Include común de las vistas de lista y calendario.</summary>
    private IQueryable<Installation> ConVistaDeLista()
        => _db.Installations
            .Include(i => i.Client)
            .Include(i => i.Plan)
            .Include(i => i.Tecnico)
            .Include(i => i.DistributionBox);

    public async Task<(List<Installation> Items, int Total)> GetPagedAsync(
        InstallationListFilter f, CancellationToken ct = default)
    {
        var q = ConVistaDeLista();

        if (f.Status.HasValue)    q = q.Where(i => i.Status    == f.Status.Value);
        if (f.TecnicoId.HasValue) q = q.Where(i => i.TecnicoId == f.TecnicoId);
        if (f.ClienteId.HasValue) q = q.Where(i => i.ClientId  == f.ClienteId);

        // Pipeline de recontacto: prospectos con teléfono, aún no convertidos.
        if (f.SoloProspectos)
            q = q.Where(i => i.ClientId == null && i.ProspectPhone != null);

        if (f.Fecha.HasValue)
        {
            // Npgsql exige Kind=Utc para parámetros timestamptz.
            var fd = DateTime.SpecifyKind(f.Fecha.Value.Date, DateTimeKind.Utc);
            q = q.Where(i => i.Fecha.Date == fd);
        }

        var total = await q.CountAsync(ct);
        var items = await q
            .OrderBy(i => i.Fecha).ThenBy(i => i.HoraInicio)
            .Skip((f.Page - 1) * f.PageSize)
            .Take(f.PageSize)
            .ToListAsync(ct);

        return (items, total);
    }

    public Task<List<Installation>> GetCalendarRangeAsync(
        DateTime desde, DateTime hasta, Guid? tecnicoId, CancellationToken ct = default)
    {
        var q = ConVistaDeLista().AsNoTracking()
            .Where(i => i.Fecha.Date >= desde && i.Fecha.Date <= hasta);

        if (tecnicoId.HasValue) q = q.Where(i => i.TecnicoId == tecnicoId);

        return q.OrderBy(i => i.Fecha).ThenBy(i => i.HoraInicio).ToListAsync(ct);
    }

    public Task<List<Installation>> GetTechnicianDayAsync(
        Guid tecnicoId, DateTime fecha, CancellationToken ct = default)
        => _db.Installations
            .Include(i => i.Client)
            .Include(i => i.Plan)
            .Where(i => i.Fecha.Date == fecha.Date
                     && (i.TecnicoId == tecnicoId
                         || i.Technicians.Any(t => t.TechnicianId == tecnicoId))
                     && i.Status != InstallationStatus.Cancelada)
            .OrderBy(i => i.HoraInicio)
            .ToListAsync(ct);
}
