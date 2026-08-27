namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>
/// Valores fijos que comparten los datos semilla de varias entidades.
///
/// <para>Eran dos variables locales al principio de <c>OnModelCreating</c>. Al
/// partir el mapeo en un archivo por entidad (F5.4) dejaron de estar en ámbito,
/// y tienen que ser constantes de todos modos: <c>HasData</c> compara los valores
/// entre migraciones, así que cualquier cosa que cambie entre ejecuciones —un
/// <c>DateTime.UtcNow</c>, por ejemplo— haría que EF detecte deriva en cada
/// arranque.</para>
/// </summary>
internal static class SeedValues
{
    /// <summary>Fecha de alta de todo lo sembrado. Fija a propósito.</summary>
    internal static readonly DateTime SeedDate =
        new(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    /// <summary>Autor de las plantillas sembradas: el administrador inicial.</summary>
    internal static readonly Guid AdminId =
        Guid.Parse("00000000-0000-0000-0000-000000000001");
}
