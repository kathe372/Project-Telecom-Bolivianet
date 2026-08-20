using System.Linq.Expressions;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Interfaces;

public interface IGenericRepository<T> where T : Entity
{
    Task<T?> GetByIdAsync(Guid id);
    IQueryable<T> GetAll();
    IQueryable<T> GetAllReadOnly();
    Task AddAsync(T entity);

    Task AddRangeAsync(IEnumerable<T> entities);

    Task SaveChangesAsync();

    Task UpdateAsync(T entity);

    Task MarkModifiedAsync(T entity);

    Task UpdateRangeAsync(IEnumerable<T> entities);

    Task DeleteAsync(Guid id);
    Task DeleteRangeAsync(IEnumerable<T> entities);
    Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate);
    Task<bool> AnyAsync(Expression<Func<T, bool>> predicate);

    // Materializadores async: permiten a la capa Application obtener listas/conteos
    // sin depender de las extensiones de EF Core (ToListAsync/CountAsync) sobre IQueryable.
    Task<int> CountAsync(Expression<Func<T, bool>> predicate);
    Task<List<T>> ListAsync(Expression<Func<T, bool>>? predicate = null);
    Task<List<T>> ListReadOnlyAsync(Expression<Func<T, bool>>? predicate = null);
}
