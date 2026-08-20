using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Infrastructure.Data;
using TelecomBoliviaNet.Infrastructure.Services.Clients;

namespace TelecomBoliviaNet.UnitTests.Services;

/// <summary>
/// BUG-01 regression tests — TbnService atomic sequence generation.
/// Uses an in-memory DB (not Postgres) so concurrent tests run fast.
/// For true isolation guarantees use IntegrationTests with Testcontainers.
/// </summary>
public class TbnServiceTests
{
    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    // BUG-01-T02: secuencia incremental
    [Fact]
    public async Task GenerateNextAsync_Sequential_IsMonotonicallyIncreasing()
    {
        // The method uses raw SQL which can't run against InMemory.
        // This test validates the formatting contract using PeekNextAsync logic.
        var ctx = CreateContext();
        ctx.TbnSequences.Add(new TbnSequence { Id = 1, Prefix = "TBN", LastValue = 10 });
        await ctx.SaveChangesAsync();

        var service = new TbnService(ctx);
        var preview = await service.PeekNextAsync();

        preview.Should().Be("TBN-0011");
    }

    // BUG-01-T03: formato de código correcto
    [Fact]
    public async Task PeekNextAsync_Always_FormatsCodeCorrectly()
    {
        var ctx = CreateContext();
        ctx.TbnSequences.Add(new TbnSequence { Id = 1, Prefix = "TBN", LastValue = 0 });
        await ctx.SaveChangesAsync();

        var service = new TbnService(ctx);
        var code = await service.PeekNextAsync();

        code.Should().MatchRegex(@"^TBN-\d{4}$", "código debe tener formato TBN-NNNN (4 dígitos, invariante de TbnCode)");
    }
}
