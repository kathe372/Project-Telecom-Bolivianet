using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;
using TelecomBoliviaNet.Domain.Services;

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
        string?  correoDelBot,
        UserRole? role,
        string?  search,
        int      page,
        int      pageSize,
        CancellationToken ct = default)
    {
        // S-01 — El chatbot no es una persona y no sale en el listado del panel.
        // Quién es lo decide BotIdentity, no una comparación de correo suelta.
        var q = _db.UserSystems.Where(BotIdentity.NoEsElChatbot(correoDelBot));

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

    public async Task<Dictionary<Guid, string>> GetNamesByIdsAsync(
        IReadOnlyCollection<Guid> ids, CancellationToken ct = default)
    {
        if (ids.Count == 0) return [];

        return await _db.UserSystems.AsNoTracking()
            .Where(u => ids.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName, ct);
    }

    public Task<List<UserSystem>> GetActiveTechniciansAsync(CancellationToken ct = default)
        => _db.UserSystems.AsNoTracking()
            .Where(u => u.Role == UserRole.Tecnico && u.Status == UserStatus.Activo)
            .OrderBy(u => u.FullName)
            .ToListAsync(ct);
}
