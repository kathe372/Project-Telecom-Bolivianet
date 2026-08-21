using System.Linq.Expressions;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Repositorio genérico por entidad.
///
/// <para><b>Contrato de persistencia.</b> Los métodos de escritura NO persisten:
/// marcan el cambio y hay que confirmarlo con <see cref="SaveChangesAsync"/>. Eso
/// permite que varias escrituras compartan una transacción de
/// <c>IUnitOfWork</c>.</para>
///
/// <para>Antes el contrato era incoherente: <c>AddAsync</c> no guardaba pero
/// <c>UpdateAsync</c>, <c>DeleteAsync</c> y sus variantes <i>Range</i> hacían
/// <c>SaveChanges()</c> por su cuenta, sin anunciarlo. El resultado era que
/// <c>IUnitOfWork</c> quedaba decorativo en media aplicación y que un handler con
/// tres <c>UpdateAsync</c> eran tres transacciones distintas: si fallaba la
/// tercera, las dos primeras ya estaban confirmadas.</para>
/// </summary>
public interface IGenericRepository<T> where T : Entity
{
    // ── Lectura ──────────────────────────────────────────────────────────────

    Task<T?> GetByIdAsync(Guid id);
    IQueryable<T> GetAll();
    IQueryable<T> GetAllReadOnly();
    Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate);
    Task<bool> AnyAsync(Expression<Func<T, bool>> predicate);

    // Materializadores async: permiten a la capa Application obtener listas/conteos
    // sin depender de las extensiones de EF Core (ToListAsync/CountAsync) sobre IQueryable.
    Task<int> CountAsync(Expression<Func<T, bool>> predicate);
    Task<List<T>> ListAsync(Expression<Func<T, bool>>? predicate = null);
    Task<List<T>> ListReadOnlyAsync(Expression<Func<T, bool>>? predicate = null);

    // ── Escritura ────────────────────────────────────────────────────────────
    // NINGUNO de estos persiste. Hay que llamar a SaveChangesAsync().

    Task AddAsync(T entity);
    Task AddRangeAsync(IEnumerable<T> entities);

    /// <summary>Marca la entidad como modificada. No persiste.</summary>
    void Update(T entity);

    /// <summary>Marca varias entidades como modificadas. No persiste.</summary>
    void UpdateRange(IEnumerable<T> entities);

    /// <summary>Marca la entidad para borrado. No persiste.</summary>
    void Remove(T entity);

    /// <summary>Marca varias entidades para borrado. No persiste.</summary>
    void RemoveRange(IEnumerable<T> entities);

    /// <summary>Confirma todo lo pendiente en el contexto.</summary>
    Task SaveChangesAsync();
}
