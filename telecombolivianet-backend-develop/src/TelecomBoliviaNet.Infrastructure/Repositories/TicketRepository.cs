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

    public Task<SupportTicket?> GetSummaryAsync(Guid id, CancellationToken ct = default)
        => _db.SupportTickets.AsNoTracking()
            .Include(t => t.Client)
            .Include(t => t.AssignedTo)
            .Include(t => t.CreatedBy)
            .FirstOrDefaultAsync(t => t.Id == id, ct);

    public Task<SupportTicket?> GetDetailAsync(Guid id, CancellationToken ct = default)
        => _db.SupportTickets.AsNoTracking()
            .IgnoreQueryFilters()
            .Include(t => t.Client).ThenInclude(c => c!.Plan)
            .Include(t => t.AssignedTo)
            .Include(t => t.CreatedBy)
            .FirstOrDefaultAsync(t => t.Id == id, ct);

    public async Task<(List<SupportTicket> Items, int Total)> GetPagedAsync(
        TicketListFilter f, CancellationToken ct = default)
    {
        var query = BaseListQuery()
            .Include(t => t.Visits).ThenInclude(v => v.Technician)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(f.Search))
        {
            var s = f.Search.Trim().ToLower();
            query = query.Where(t =>
                (t.Client != null && t.Client.FullName.ToLower().Contains(s)) ||
                (t.Client != null && t.Client.TbnCode.ToLower().Contains(s))  ||
                t.Subject.ToLower().Contains(s)                               ||
                t.Description.ToLower().Contains(s));
        }

        if (!string.IsNullOrEmpty(f.Status) && f.Status != "all"
            && Enum.TryParse<TicketStatus>(f.Status, out var st))
            query = query.Where(t => t.Status == st);

        if (!string.IsNullOrEmpty(f.Priority) && f.Priority != "all"
            && Enum.TryParse<TicketPriority>(f.Priority, out var pr))
            query = query.Where(t => t.Priority == pr);

        if (!string.IsNullOrEmpty(f.Type) && f.Type != "all"
            && Enum.TryParse<TicketType>(f.Type, out var tp))
            query = query.Where(t => t.Type == tp);

        if (f.AssignedToId.HasValue)
            query = query.Where(t => t.AssignedToUserId == f.AssignedToId.Value);

        if (f.OverdueSlaBefore is DateTime vencidoAntesDe)
            query = query.Where(t => t.DueDate.HasValue && t.DueDate.Value < vencidoAntesDe
                                  && !ResueltoOCerrado.Contains(t.Status));

        if (f.DateFrom.HasValue)
            query = query.Where(t => t.CreatedAt >= f.DateFrom.Value);

        if (f.DateTo.HasValue)
            query = query.Where(t => t.CreatedAt <= f.DateTo.Value.AddDays(1).AddTicks(-1));

        if (f.SlaCompliant.HasValue)
            query = query.Where(t => t.SlaCompliant == f.SlaCompliant.Value);

        // Lo que sigue abierto va primero; dentro de eso, por prioridad y luego
        // por antigüedad. Es el orden en que se atiende la cola.
        query = query
            .OrderBy(t => t.Status == TicketStatus.Resuelto || t.Status == TicketStatus.Cerrado ? 1 : 0)
            .ThenBy(t => t.Priority == TicketPriority.Critica ? 0
                       : t.Priority == TicketPriority.Alta    ? 1
                       : t.Priority == TicketPriority.Media   ? 2 : 3)
            .ThenBy(t => t.CreatedAt);

        var total = await query.CountAsync(ct);
        var items = await query
            .Skip((f.Page - 1) * f.PageSize)
            .Take(f.PageSize)
            .ToListAsync(ct);

        return (items, total);
    }

    public Task<List<SupportTicket>> GetForClientAsync(
        Guid clientId, CancellationToken ct = default)
        => BaseListQuery()
            .Where(t => t.ClientId == clientId)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(ct);

    public Task<List<SupportTicket>> GetOverdueSlaAsync(
        DateTime          now,
        DateTime?         from           = null,
        DateTime?         to             = null,
        string?           technicianName = null,
        CancellationToken ct             = default)
    {
        var query = BaseListQuery()
            .Where(t => t.DueDate.HasValue && t.DueDate.Value < now
                     && !ResueltoOCerrado.Contains(t.Status));

        if (from.HasValue) query = query.Where(t => t.CreatedAt >= from.Value);
        if (to.HasValue)   query = query.Where(t => t.CreatedAt <= to.Value);

        if (!string.IsNullOrWhiteSpace(technicianName))
        {
            var tecnico = technicianName.ToUpper();
            query = query.Where(t => t.AssignedTo != null
                                  && t.AssignedTo.FullName.ToUpper().Contains(tecnico));
        }

        return query.OrderBy(t => t.DueDate).ToListAsync(ct);
    }

    public Task<List<SlaTrackedTicket>> GetSlaTrackedAsync(CancellationToken ct = default)
        => _db.SupportTickets.AsNoTracking()
            .IgnoreQueryFilters()
            .Where(t => t.DueDate.HasValue && !ResueltoOCerrado.Contains(t.Status))
            .Select(t => new SlaTrackedTicket(
                t.Id, t.TicketNumber, t.Subject, t.Priority, t.Status,
                t.Client != null ? t.Client.FullName : "",
                t.AssignedTo != null ? t.AssignedTo.FullName : null,
                t.CreatedAt, t.DueDate!.Value))
            .ToListAsync(ct);

    public Task<SupportTicket?> GetWithClientAsync(Guid id, CancellationToken ct = default)
        => _db.SupportTickets
            .Include(t => t.Client)
            .FirstOrDefaultAsync(t => t.Id == id, ct);

    public async Task<Dictionary<Guid, TechnicianLoad>> GetOpenLoadByTechnicianAsync(
        IReadOnlyCollection<Guid> technicianIds, CancellationToken ct = default)
    {
        if (technicianIds.Count == 0) return [];

        var cargas = await _db.SupportTickets.AsNoTracking()
            .Where(t => t.AssignedToUserId.HasValue
                     && technicianIds.Contains(t.AssignedToUserId!.Value)
                     && Vivos.Contains(t.Status))
            .GroupBy(t => t.AssignedToUserId!.Value)
            .Select(g => new
            {
                TecnicoId = g.Key,
                Total     = g.Count(),
                Criticos  = g.Count(t => t.Priority == TicketPriority.Critica),
            })
            .ToListAsync(ct);

        return cargas.ToDictionary(x => x.TecnicoId, x => new TechnicianLoad(x.Total, x.Criticos));
    }

    public async Task<Dictionary<Guid, DateTime>> GetLastAssignmentByTechnicianAsync(
        IReadOnlyCollection<Guid> technicianIds, CancellationToken ct = default)
    {
        if (technicianIds.Count == 0) return [];

        var ultimas = await _db.SupportTickets.AsNoTracking()
            .Where(t => t.AssignedToUserId.HasValue
                     && technicianIds.Contains(t.AssignedToUserId!.Value))
            .GroupBy(t => t.AssignedToUserId!.Value)
            .Select(g => new { TecnicoId = g.Key, Ultimo = g.Max(t => t.CreatedAt) })
            .ToListAsync(ct);

        return ultimas.ToDictionary(x => x.TecnicoId, x => x.Ultimo);
    }

    /// <summary>Estados en los que el ticket sigue ocupando a un técnico.</summary>
    private static readonly TicketStatus[] Vivos =
    [
        TicketStatus.Abierto,
        TicketStatus.EnProceso,
        TicketStatus.PendienteCliente,
    ];

    /// <summary>
    /// Estados en los que un ticket ya no consume SLA. PendienteCliente cuenta:
    /// el reloj lo para el cliente, no nosotros.
    /// </summary>
    private static readonly TicketStatus[] ResueltoOCerrado =
    [
        TicketStatus.Resuelto,
        TicketStatus.Cerrado,
        TicketStatus.PendienteCliente,
    ];

    /// <summary>
    /// Base de los listados: solo lectura y sin el filtro de borrado del cliente
    /// —un ticket histórico no debe perder el nombre de su cliente porque a este
    /// se le dio de baja— con lo que la fila del listado necesita mostrar.
    /// </summary>
    private IQueryable<SupportTicket> BaseListQuery()
        => _db.SupportTickets.AsNoTracking()
            .IgnoreQueryFilters()
            .Include(t => t.Client)
            .Include(t => t.AssignedTo)
            .Include(t => t.CreatedBy)
            .Include(t => t.WorkLogs);
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
