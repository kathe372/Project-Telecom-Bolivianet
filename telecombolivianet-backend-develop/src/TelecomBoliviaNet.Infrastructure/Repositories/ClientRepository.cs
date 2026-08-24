using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;
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

    public Task<Client?> GetWithInvoicesAsync(Guid id, CancellationToken ct = default)
        => _db.Clients.Include(c => c.Invoices).FirstOrDefaultAsync(c => c.Id == id, ct);

    // IgnoreQueryFilters: la ficha de un cliente dado de baja debe seguir
    // abriéndose — es justo donde se consulta por qué se dio de baja y qué
    // quedó pendiente.
    public Task<Client?> GetDetailAsync(Guid id, CancellationToken ct = default)
        => _db.Clients.AsNoTracking()
            .IgnoreQueryFilters()
            .Include(c => c.Plan)
            .Include(c => c.InstalledBy)
            .Include(c => c.Invoices)
                .ThenInclude(i => i.PaymentInvoices)
                    .ThenInclude(pi => pi.Payment)
            .FirstOrDefaultAsync(c => c.Id == id, ct);

    public Task<List<Client>> GetByAnyPhoneAsync(
        IReadOnlyCollection<string> phones, CancellationToken ct = default)
        => _db.Clients.AsNoTracking()
            .Include(c => c.Plan)
            .Include(c => c.Invoices)
            .Where(c => phones.Contains(c.PhoneMain)
                     || (c.PhoneSecondary != null && phones.Contains(c.PhoneSecondary)))
            .OrderBy(c => c.CreatedAt)
            .ToListAsync(ct);

    public async Task<(List<Client> Items, int Total)> GetPagedAsync(
        ClientListFilter filter, CancellationToken ct = default)
    {
        // Los dados de baja quedan fuera por el filtro global de la entidad; el
        // listado los pide explícitamente cuando el operador filtra por ese
        // estado (o por "todos").
        var query = (filter.IncludeDeleted
                ? _db.Clients.IgnoreQueryFilters()
                : _db.Clients.AsQueryable())
            .AsNoTracking()
            .Include(c => c.Plan)
            .Include(c => c.Invoices)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(filter.Search))
            query = ClientQuerySpecs.ApplyFullTextSearch(query, filter.Search);

        if (!string.IsNullOrWhiteSpace(filter.Status) && filter.Status != "all"
            && Enum.TryParse<ClientStatus>(filter.Status, out var status))
            query = query.Where(c => c.Status == status);

        if (filter.PlanId.HasValue)
            query = query.Where(c => c.PlanId == filter.PlanId.Value);

        if (!string.IsNullOrWhiteSpace(filter.Zone))
            query = query.Where(c => c.Zone == filter.Zone);

        if (filter.HasEmail == true)  query = query.Where(c => c.Email != null && c.Email != "");
        if (filter.HasEmail == false) query = query.Where(c => c.Email == null || c.Email == "");

        query = ClientQuerySpecs.ApplyDebtFilter(query, filter.DebtFilter);

        query = filter.SortBy switch
        {
            "zone" => query.OrderBy(c => c.Zone),
            "name" => query.OrderBy(c => c.FullName),
            _      => query.OrderBy(c => c.TbnCode),
        };

        var total = await query.CountAsync(ct);
        var items = await query
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync(ct);

        return (items, total);
    }
}
