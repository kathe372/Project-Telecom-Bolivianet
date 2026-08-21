using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Repositories;

public class GenericRepository<T> : IGenericRepository<T> where T : Entity
{
    private readonly AppDbContext _context;
    private readonly DbSet<T> _set;

    public GenericRepository(AppDbContext context)
    {
        _context = context;
        _set     = context.Set<T>();
    }

    // ── Lectura ──────────────────────────────────────────────────────────────

    public async Task<T?> GetByIdAsync(Guid id)
        => await _set.FindAsync(id);

    public IQueryable<T> GetAll()
        => _set.AsQueryable();

    public IQueryable<T> GetAllReadOnly()
        => _set.AsNoTracking().AsQueryable();

    public Task<int> CountAsync(Expression<Func<T, bool>> predicate)
        => _set.AsNoTracking().CountAsync(predicate);

    public async Task<List<T>> ListAsync(Expression<Func<T, bool>>? predicate = null)
        => predicate is null
            ? await _set.ToListAsync()
            : await _set.Where(predicate).ToListAsync();

    public async Task<List<T>> ListReadOnlyAsync(Expression<Func<T, bool>>? predicate = null)
    {
        var query = _set.AsNoTracking();
        if (predicate is not null) query = query.Where(predicate);
        return await query.ToListAsync();
    }

    public async Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate)
        => await _set.FirstOrDefaultAsync(predicate);

    public async Task<bool> AnyAsync(Expression<Func<T, bool>> predicate)
        => await _set.AnyAsync(predicate);

    // ── Escritura (no persiste) ──────────────────────────────────────────────

    public async Task AddAsync(T entity)
        => await _set.AddAsync(entity);

    public async Task AddRangeAsync(IEnumerable<T> entities)
        => await _set.AddRangeAsync(entities);

    public void Update(T entity) => MarkAsModified(entity);

    public void UpdateRange(IEnumerable<T> entities)
    {
        foreach (var entity in entities) MarkAsModified(entity);
    }

    public void Remove(T entity) => _set.Remove(entity);

    public void RemoveRange(IEnumerable<T> entities) => _set.RemoveRange(entities);

    public async Task SaveChangesAsync() => await _context.SaveChangesAsync();

    /// <summary>
    /// Si el contexto ya sigue una instancia con ese Id, se copian los valores
    /// sobre la seguida en vez de adjuntar una segunda: adjuntar dos instancias
    /// del mismo Id hace que EF lance.
    ///
    /// El estado Added se respeta a propósito: una entidad recién añadida y aún
    /// no persistida no debe degradarse a Modified, o el INSERT se convertiría en
    /// un UPDATE de una fila que no existe.
    /// </summary>
    private void MarkAsModified(T entity)
    {
        var tracked = _context.ChangeTracker.Entries<T>()
            .FirstOrDefault(e => e.Entity.Id == entity.Id);

        if (tracked is not null)
        {
            tracked.CurrentValues.SetValues(entity);
            if (tracked.State != EntityState.Added)
                tracked.State = EntityState.Modified;
        }
        else
        {
            _context.Entry(entity).State = EntityState.Modified;
        }
    }
}
