using System.Linq.Expressions;
using MockQueryable;
using MockQueryable.Moq;
using Moq;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Tests.Helpers;

/// <summary>
/// Helper para construir mocks de IGenericRepository&lt;T&gt; con datos en memoria.
/// Evita repetir el mismo boilerplate de setup en cada test.
///
/// Uso:
///   var repo = RepoMock.Of(invoice1, invoice2);
///   // repo.Object es un IGenericRepository&lt;Invoice&gt; con esos datos
/// </summary>
public static class RepoMock
{
    public static Mock<IGenericRepository<T>> Of<T>(params T[] items) where T : Entity
    {
        var list = items.ToList();
        var mock = new Mock<IGenericRepository<T>>();

        // GetAll() devuelve IQueryable con soporte async (MockQueryable)
        // Necesario para que FirstOrDefaultAsync/ToListAsync funcionen en tests unitarios
        mock.Setup(r => r.GetAll())
            .Returns(() => list.AsQueryable().BuildMock());

        // GetAllReadOnly() — mismo comportamiento que GetAll() en tests
        mock.Setup(r => r.GetAllReadOnly())
            .Returns(() => list.AsQueryable().BuildMock());

        // GetByIdAsync — busca por Id
        mock.Setup(r => r.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((Guid id) => list.FirstOrDefault(e => e.Id == id));

        // FirstOrDefaultAsync — evalúa el predicado en memoria
        mock.Setup(r => r.FirstOrDefaultAsync(It.IsAny<Expression<Func<T, bool>>>()))
            .ReturnsAsync((Expression<Func<T, bool>> pred) =>
                list.AsQueryable().FirstOrDefault(pred));

        // AnyAsync — evalúa el predicado en memoria
        mock.Setup(r => r.AnyAsync(It.IsAny<Expression<Func<T, bool>>>()))
            .ReturnsAsync((Expression<Func<T, bool>> pred) =>
                list.AsQueryable().Any(pred));

        // CountAsync — cuenta en memoria según el predicado
        mock.Setup(r => r.CountAsync(It.IsAny<Expression<Func<T, bool>>>()))
            .ReturnsAsync((Expression<Func<T, bool>> pred) =>
                list.AsQueryable().Count(pred));

        // ListAsync / ListReadOnlyAsync — materializan en memoria (predicado opcional)
        mock.Setup(r => r.ListAsync(It.IsAny<Expression<Func<T, bool>>?>()))
            .ReturnsAsync((Expression<Func<T, bool>>? pred) =>
                pred is null ? list.ToList() : list.AsQueryable().Where(pred).ToList());

        mock.Setup(r => r.ListReadOnlyAsync(It.IsAny<Expression<Func<T, bool>>?>()))
            .ReturnsAsync((Expression<Func<T, bool>>? pred) =>
                pred is null ? list.ToList() : list.AsQueryable().Where(pred).ToList());

        // AddAsync — agrega a la lista en memoria
        mock.Setup(r => r.AddAsync(It.IsAny<T>()))
            .Callback<T>(e => list.Add(e))
            .Returns(Task.CompletedTask);

        // AddRangeAsync — agrega múltiples sin commit
        mock.Setup(r => r.AddRangeAsync(It.IsAny<IEnumerable<T>>()))
            .Callback<IEnumerable<T>>(entities => list.AddRange(entities))
            .Returns(Task.CompletedTask);

        // SaveChangesAsync — no-op en tests (ya se agregó en AddRangeAsync)
        mock.Setup(r => r.SaveChangesAsync())
            .Returns(Task.CompletedTask);

        // ── Contrato nuevo (F3): marcar y confirmar por separado ─────────────
        // Update/UpdateRange/Remove/RemoveRange son void y NO persisten. Aquí se
        // aplican al listado igualmente: en un mock no hay un SaveChanges real que
        // diferenciar, y lo que interesa es que el servicio vea el efecto.

        mock.Setup(r => r.Update(It.IsAny<T>()))
            .Callback<T>(updated =>
            {
                var idx = list.FindIndex(e => e.Id == updated.Id);
                if (idx >= 0) list[idx] = updated;
            });

        mock.Setup(r => r.UpdateRange(It.IsAny<IEnumerable<T>>()))
            .Callback<IEnumerable<T>>(updates =>
            {
                foreach (var updated in updates)
                {
                    var idx = list.FindIndex(e => e.Id == updated.Id);
                    if (idx >= 0) list[idx] = updated;
                }
            });

        mock.Setup(r => r.Remove(It.IsAny<T>()))
            .Callback<T>(entity => list.Remove(entity));

        mock.Setup(r => r.RemoveRange(It.IsAny<IEnumerable<T>>()))
            .Callback<IEnumerable<T>>(entities =>
            {
                foreach (var e in entities.ToList()) list.Remove(e);
            });



        return mock;
    }

    /// <summary>Repo vacío — útil para repos de entidades que no necesitan datos iniciales.</summary>
    public static Mock<IGenericRepository<T>> Empty<T>() where T : Entity
        => Of<T>();
}
