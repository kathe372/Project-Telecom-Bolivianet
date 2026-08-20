using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
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
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgis/postgis:16-3.4-alpine")
        .Build();

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
                ["ConnectionStrings:DefaultConnection"] = _postgres.GetConnectionString(),
                ["Jwt:Key"] = "IntegrationTests_JWT_Key_MinLength32Characters_1234567890",
                ["SkipStartupMigration"] = "true",
            });
        });
    }

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(_postgres.GetConnectionString(), npgsql => npgsql.UseNetTopologySuite())
            .Options;

        await using var db = new AppDbContext(options);
        await db.Database.ExecuteSqlRawAsync("CREATE EXTENSION IF NOT EXISTS postgis;");
        await db.Database.EnsureCreatedAsync();
    }

    async Task IAsyncLifetime.DisposeAsync() => await _postgres.DisposeAsync();
}
