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

    public async Task AddAsync(T entity)
    {
        await _set.AddAsync(entity);
    }

    public async Task AddRangeAsync(IEnumerable<T> entities)
    {
        await _set.AddRangeAsync(entities);
    }

    public async Task SaveChangesAsync()
    {
        await _context.SaveChangesAsync();
    }

    public Task MarkModifiedAsync(T entity)
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

        return Task.CompletedTask;
    }

    public async Task UpdateAsync(T entity)
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
            var exists = await _set.AnyAsync(e => e.Id == entity.Id);
            if (!exists)
                throw new KeyNotFoundException("Registro no encontrado.");

            _context.Entry(entity).State = EntityState.Modified;
        }

        await _context.SaveChangesAsync();
    }

    public async Task UpdateRangeAsync(IEnumerable<T> entities)
    {
        foreach (var entity in entities)
        {
            var tracked = _context.ChangeTracker.Entries<T>()
                .FirstOrDefault(e => e.Entity.Id == entity.Id);

            if (tracked is not null)
            {
                tracked.CurrentValues.SetValues(entity);
                tracked.State = EntityState.Modified;
            }
            else
            {
                _context.Entry(entity).State = EntityState.Modified;
            }
        }

        await _context.SaveChangesAsync();
    }

    public async Task DeleteRangeAsync(IEnumerable<T> entities)
    {
        _set.RemoveRange(entities);
        await _context.SaveChangesAsync();
    }

    public async Task DeleteAsync(Guid id)
    {
        var entity = await _set.FindAsync(id);
        if (entity is not null)
        {
            _set.Remove(entity);
            await _context.SaveChangesAsync();
        }
    }

    public async Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate)
        => await _set.FirstOrDefaultAsync(predicate);

    public async Task<bool> AnyAsync(Expression<Func<T, bool>> predicate)
        => await _set.AnyAsync(predicate);
}
