using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Testcontainers.PostgreSql;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Fixtures;

/// <summary>
/// Boots the real API against a throwaway PostgreSQL/PostGIS container so
/// integration tests never touch the developer/production database.
///
/// The app's own migrations are known to drift from the EF model (a couple of
/// migrations lack the [Migration] attribute and were patched in prod via raw
/// SQL), so a clean MigrateAsync() fails. To get a correct, model-accurate
/// schema for tests we:
///   1. Override the connection string + a test JWT key via in-memory config.
///   2. Set "SkipStartupMigration=true" so Program.cs does NOT auto-migrate/seed.
///   3. Build the schema directly from the EF model with EnsureCreated().
/// None of this changes production behaviour (the flag defaults to false).
/// </summary>
public class CustomWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    // ── D-10 · Un contenedor para toda la suite, una base por clase ──────────
    //
    // `IClassFixture<T>` crea una instancia POR CLASE, y había 26 clases: la
    // suite arrancaba y paraba 26 contenedores PostGIS, uno detrás de otro. Ahí
    // se iba la mayor parte del tiempo de ejecución.
    //
    // La entrada de D-10 proponía compartir la BASE entre clases con
    // `ICollectionFixture`, y advertía —con razón— de que eso expondría a las
    // clases que no limpian del todo a los restos de las demás: cambiar un flaky
    // resuelto por uno nuevo.
    //
    // No hace falta llegar ahí. Lo caro es levantar el CONTENEDOR, no crear una
    // base: lo primero son segundos, lo segundo milisegundos. Así que el
    // contenedor se comparte y cada clase sigue recibiendo su propia base,
    // vacía y suya. **El aislamiento entre clases no cambia en absoluto.**
    private static readonly SemaphoreSlim Arranque = new(1, 1);
    private static PostgreSqlContainer? _compartido;

    private string _connectionString = string.Empty;

    private static async Task<PostgreSqlContainer> ContenedorAsync()
    {
        if (_compartido is not null) return _compartido;

        await Arranque.WaitAsync();
        try
        {
            if (_compartido is null)
            {
                var c = new PostgreSqlBuilder()
                    .WithImage("postgis/postgis:16-3.4-alpine")
                    .Build();
                await c.StartAsync();
                _compartido = c;
            }
            return _compartido;
        }
        finally
        {
            Arranque.Release();
        }
    }

    static CustomWebApplicationFactory()
    {
        // Program.cs validates Jwt:Key very early (before the host is built), so it
        // must come from a source CreateBuilder reads immediately. In-memory config
        // added via ConfigureAppConfiguration is applied too late for that check, so
        // we expose the test key as an environment variable (Jwt__Key => Jwt:Key).
        Environment.SetEnvironmentVariable(
            "Jwt__Key", "IntegrationTests_JWT_Key_MinLength32Characters_1234567890");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Security-header tests assert production behaviour (e.g. HSTS). Setting the
        // environment here (rather than via WithWebHostBuilder, which does not
        // propagate reliably under the minimal-hosting model) makes it stick.
        builder.UseEnvironment("Production");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = _connectionString,
                ["Jwt:Key"] = "IntegrationTests_JWT_Key_MinLength32Characters_1234567890",
                ["SkipStartupMigration"] = "true",
            });
        });

        // ── Fuera los jobs en segundo plano (D-03) ───────────────────────────
        //
        // Program.cs registra ONCE BackgroundService, y WebApplicationFactory
        // arranca el host de verdad: esos jobs quedaban VIVOS durante toda la
        // suite, ejecutándose contra la base de pruebas.
        //
        // Cinco de ellos (SlaAlert, AutoSuspend, AutoClose, SendInstallationReminders,
        // ApplyScheduledPlanChanges) publican en NotifOutbox. Cuando el temporizador
        // de alguno caía justo entre el `DELETE FROM "NotifOutbox"` y el
        // `DELETE FROM "Clients"` de la limpieza de un test, insertaba una fila que
        // rompía el borrado siguiente:
        //
        //   23503: update or delete on table "Clients" violates foreign key
        //          constraint "FK_NotifOutbox_Clients_ClienteId"
        //
        // Ése era el fallo intermitente: ~1 de cada 10 ejecuciones, en un test
        // distinto cada vez (el que tuviera la mala suerte de limpiar en ese
        // instante). Se cazó con 10 corridas seguidas guardando .trx.
        //
        // Ningún test depende de que los jobs se disparen solos: los dos que los
        // prueban (ScheduledPlanChangeIntegrationTests y
        // AutoSuspendCharacterizationTests) los instancian a mano y llaman a
        // RunAsync, justamente para no depender de la ventana horaria.
        //
        // Se filtra por espacio de nombres a propósito: quitar TODOS los
        // IHostedService eliminaría también GenericWebHostService, que es el que
        // levanta el servidor de pruebas.
        builder.ConfigureTestServices(services =>
        {
            var jobs = services
                .Where(d => d.ServiceType == typeof(IHostedService)
                         && d.ImplementationType?.Namespace == "TelecomBoliviaNet.Infrastructure.Jobs")
                .ToList();

            foreach (var job in jobs) services.Remove(job);
        });
    }

    public async Task InitializeAsync()
    {
        var contenedor = await ContenedorAsync();

        // Una base por clase, con nombre único. Crear la base es lo barato.
        var nombre = $"tbn_{Guid.NewGuid():N}";

        await using (var admin = new Npgsql.NpgsqlConnection(contenedor.GetConnectionString()))
        {
            await admin.OpenAsync();
            await using var cmd = admin.CreateCommand();
            cmd.CommandText = $"CREATE DATABASE \"{nombre}\"";
            await cmd.ExecuteNonQueryAsync();
        }

        _connectionString = new Npgsql.NpgsqlConnectionStringBuilder(contenedor.GetConnectionString())
        {
            Database = nombre,
        }.ConnectionString;

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(_connectionString, npgsql => npgsql.UseNetTopologySuite())
            .Options;

        await using var db = new AppDbContext(options);
        // PostGIS se instala POR BASE, no por servidor.
        await db.Database.ExecuteSqlRawAsync("CREATE EXTENSION IF NOT EXISTS postgis;");
        await db.Database.EnsureCreatedAsync();
    }

    /// <summary>
    /// La base de esta clase se queda; el contenedor entero muere al terminar el
    /// proceso —de eso se encarga el recolector de Testcontainers—. Borrarla
    /// aquí obligaría a cerrar antes todas las conexiones del pool, que es más
    /// frágil que dejar que se lleve el contenedor por delante.
    /// </summary>
    Task IAsyncLifetime.DisposeAsync() => Task.CompletedTask;
}
