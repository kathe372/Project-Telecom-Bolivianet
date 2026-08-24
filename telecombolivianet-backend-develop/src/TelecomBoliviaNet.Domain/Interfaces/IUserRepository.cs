using TelecomBoliviaNet.Domain.Entities.Auth;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Consultas de usuarios del sistema. Ver ADR-001.
/// </summary>
public interface IUserRepository : IGenericRepository<UserSystem>
{
    /// <summary>
    /// Usuario por Id <b>incluidos los borrados</b>.
    ///
    /// La entidad tiene un filtro global de borrado lógico
    /// (<c>HasQueryFilter(u =&gt; !u.IsDeleted)</c>), así que la ficha de detalle
    /// necesita saltárselo explícitamente para poder mostrar un usuario dado de
    /// baja. Antes eso obligaba al handler a llamar a <c>IgnoreQueryFilters()</c>,
    /// una extensión de EF Core.
    /// </summary>
    Task<UserSystem?> GetByIdIncludingDeletedAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Página de usuarios, filtrada y ordenada por nombre. Devuelve también el
    /// total para la paginación.
    ///
    /// El filtrado, el conteo y el <c>Skip/Take</c> se resuelven en SQL: traer
    /// todos los usuarios a memoria para quedarse con veinte sería tirar la base
    /// de datos por la ventana.
    /// </summary>
    Task<(List<UserSystem> Items, int Total)> GetPagedAsync(
        string   excludeEmail,
        UserRole? role,
        string?  search,
        int      page,
        int      pageSize,
        CancellationToken ct = default);

    /// <summary>
    /// Nombre de cada usuario indicado, indexado por Id. Para listados que
    /// muestran "quién hizo esto" sin necesitar la ficha completa: se resuelve
    /// en una consulta en vez de una por fila.
    /// </summary>
    Task<Dictionary<Guid, string>> GetNamesByIdsAsync(
        IReadOnlyCollection<Guid> ids, CancellationToken ct = default);
}
