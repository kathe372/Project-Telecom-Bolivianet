using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Repositories;

/// <summary>Implementación de <see cref="IUserRepository"/>. Ver ADR-001.</summary>
public class UserRepository : GenericRepository<UserSystem>, IUserRepository
{
    private readonly AppDbContext _db;

    public UserRepository(AppDbContext db) : base(db) => _db = db;

    public Task<UserSystem?> GetByIdIncludingDeletedAsync(Guid id, CancellationToken ct = default)
        => _db.UserSystems
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == id, ct);

    public async Task<(List<UserSystem> Items, int Total)> GetPagedAsync(
        string   excludeEmail,
        UserRole? role,
        string?  search,
        int      page,
        int      pageSize,
        CancellationToken ct = default)
    {
        var q = _db.UserSystems.Where(u => u.Email != excludeEmail);

        if (role.HasValue) q = q.Where(u => u.Role == role.Value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            q = q.Where(u => u.FullName.ToLower().Contains(s) ||
                             u.Email.ToLower().Contains(s));
        }

        q = q.OrderBy(u => u.FullName);

        var total = await q.CountAsync(ct);
        var items = await q.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        return (items, total);
    }
}
