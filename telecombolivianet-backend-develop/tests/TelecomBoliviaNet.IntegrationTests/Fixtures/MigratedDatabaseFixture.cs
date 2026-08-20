using Microsoft.EntityFrameworkCore;
using Npgsql;
using Testcontainers.PostgreSql;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Fixtures;

/// <summary>
/// Levanta un PostgreSQL limpio y aplica <b>LAS MIGRACIONES</b> — no
/// <c>EnsureCreated()</c>.
///
/// Es la diferencia con <see cref="CustomWebApplicationFactory"/>, que construye
/// el esquema directamente desde el modelo de EF. Esa vía es cómoda para probar
/// lógica de negocio, pero tiene un punto ciego enorme: <b>nunca ejercita las
/// migraciones</b>, que son las que definen el esquema que hay en producción.
/// Con ese fixture, la suite puede estar en verde mientras las migraciones ya no
/// reconstruyen la base.
///
/// Este fixture existe para cerrar ese hueco. Es la base de
/// <c>SchemaParityTests</c>, el guardia que sustituye al protocolo
/// "genera una migración y comprueba que sale vacía" — protocolo que en este
/// proyecto NO sirve, porque las migraciones están escritas a mano y EF siempre
/// reporta cambios pendientes (ver ADR-004 y la sección C1 del plan).
///
/// Si <see cref="InitializeAsync"/> falla, el fallo ES el hallazgo: significa
/// que las migraciones no levantan una base desde cero.
/// </summary>
public class MigratedDatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgis/postgis:16-3.4-alpine")
        .Build();

    public AppDbContext DbContext    { get; private set; } = null!;
    public string       ConnectionString => _postgres.GetConnectionString();

    /// <summary>
    /// Null si las migraciones se aplicaron bien. Si fallaron, contiene el error:
    /// los tests lo reportan como diagnóstico en vez de reventar en el fixture,
    /// que daría un mensaje mucho menos útil.
    /// </summary>
    public Exception? MigrationFailure { get; private set; }

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(ConnectionString, npgsql => npgsql.UseNetTopologySuite())
            .Options;

        DbContext = new AppDbContext(options);

        // La migración 20260531000001_AddCoverageModule ya hace
        // "CREATE EXTENSION IF NOT EXISTS postgis", pero se adelanta aquí para
        // que un fallo de extensión no se confunda con un fallo de migración.
        await DbContext.Database.ExecuteSqlRawAsync("CREATE EXTENSION IF NOT EXISTS postgis;");

        try
        {
            await DbContext.Database.MigrateAsync();
        }
        catch (Exception ex)
        {
            MigrationFailure = ex;
        }
    }

    public async Task DisposeAsync()
    {
        await DbContext.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    /// <summary>Columnas reales de la base, como "tabla.columna" en minúsculas.</summary>
    public async Task<HashSet<string>> ReadActualColumnsAsync()
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        // Solo BASE TABLE: information_schema.columns incluye también las columnas
        // de las VISTAS, y PostGIS crea geometry_columns/geography_columns, que no
        // son parte del esquema de la aplicación.
        cmd.CommandText = """
            SELECT c.table_name, c.column_name
            FROM information_schema.columns c
            JOIN information_schema.tables t
              ON t.table_schema = c.table_schema AND t.table_name = c.table_name
            WHERE c.table_schema = 'public'
              AND t.table_type   = 'BASE TABLE'
              AND c.table_name NOT IN ('__EFMigrationsHistory', 'spatial_ref_sys')
            """;

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            result.Add($"{reader.GetString(0)}.{reader.GetString(1)}");

        return result;
    }

    /// <summary>Tablas reales de la base, en minúsculas.</summary>
    public async Task<HashSet<string>> ReadActualTablesAsync()
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type   = 'BASE TABLE'
              AND table_name NOT IN ('__EFMigrationsHistory', 'spatial_ref_sys')
            """;

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            result.Add(reader.GetString(0));

        return result;
    }
}
