using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Billing;

/// <summary>
/// Auditoría 2026-08-06 — BUG-01 y BUG-07, verificados contra PostgreSQL real.
///
/// Los dos fixes sustituyen filtros literales por
/// <c>InvoiceDomainService.UnpaidStatuses.Contains(i.Status)</c> y
/// <c>OverdueEligible.Contains(i.Status)</c> dentro de consultas EF. Un test unitario con
/// LINQ-to-Objects los daría por buenos aunque EF no supiera traducirlos: <c>Status</c> se
/// persiste como texto (<c>HasConversion&lt;string&gt;</c>), así que la traducción a
/// <c>IN ('Emitida', 'Enviada', …)</c> solo se comprueba de verdad ejecutando el SQL.
///
/// Escenario común a todos los tests: es día 3 del mes, la facturación ya corrió y las
/// facturas nuevas están en <c>Emitida</c> con vencimiento el día 5.
/// </summary>
public class DebtDefinitionIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public DebtDefinitionIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private static readonly Guid PlanId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    private sealed record Seeded(IServiceScope Scope, AppDbContext Db, Guid ClientId);

    /// <summary>
    /// Deja la base con un único cliente y las facturas indicadas. Se limpia antes de cada
    /// test para que el orden de ejecución no influya en el resultado.
    /// </summary>
    private async Task<Seeded> SeedAsync(params Invoice[] invoices)
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // El orden respeta las FK. NotifOutbox/NotifLogs entran porque MarkOverdueInvoicesAsync
        // encola el aviso de mora del cliente y esas filas lo referencian.
        await db.Database.ExecuteSqlRawAsync(
            """
            DELETE FROM "NotifLogs";
            DELETE FROM "NotifOutbox";
            DELETE FROM "PaymentInvoices";
            DELETE FROM "Payments";
            DELETE FROM "Invoices";
            DELETE FROM "CreditMovements";
            DELETE FROM "Clients";
            DELETE FROM "Plans";
            DELETE FROM "UserSystems";
            """);

        db.Set<UserSystem>().Add(new UserSystem
        {
            Id = UserId, FullName = "Operador Test", Email = $"op-{UserId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Operador, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = PlanId, Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149m, IsActive = true,
        });

        var client = Client.Create(
            tbnCode:           "TBN-9001",
            fullName:          "Cliente Integracion",
            identityCard:      "9001001",
            phoneMain:         "59171000001",
            zone:              "Zona Norte",
            installationDate:  DateTime.UtcNow.AddMonths(-6),
            installedByUserId: UserId,
            planId:            PlanId);
        client.WinboxNumber = "WB-9001";
        db.Set<Client>().Add(client);

        foreach (var inv in invoices)
        {
            inv.ClientId = client.Id;
            db.Set<Invoice>().Add(inv);
        }

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Seeded(scope, db, client.Id);
    }

    private static Invoice Inv(
        int month, InvoiceStatus status, decimal amount = 149m, decimal paid = 0m,
        int diasHastaVencimiento = 2) => new()
    {
        Id         = Guid.NewGuid(),
        Type       = InvoiceType.Mensualidad,
        Status     = status,
        Year       = 2026,
        Month      = month,
        Amount     = amount,
        AmountPaid = paid,
        IssuedAt   = DateTime.UtcNow,
        DueDate    = DateTime.UtcNow.AddDays(diasHastaVencimiento),
    };

    // ════════════════════════════════════════════════════════════════════════
    // BUG-01 — el contexto de las plantillas de WhatsApp
    // ════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData(InvoiceStatus.Emitida)]            // ← el estado del bug
    [InlineData(InvoiceStatus.Enviada)]            // ← el estado del bug
    [InlineData(InvoiceStatus.Pendiente)]
    [InlineData(InvoiceStatus.Vencida)]
    [InlineData(InvoiceStatus.ParcialmentePagada)]
    public async Task ContextoDePlantilla_EstadoImpago_ReportaLaDeudaReal(InvoiceStatus status)
    {
        var seeded = await SeedAsync(Inv(month: 8, status: status));
        using var scope = seeded.Scope;

        var builder = scope.ServiceProvider.GetRequiredService<NotifContextBuilderService>();
        var ctx     = await builder.BuildAsync(seeded.ClientId);

        Assert.Equal("149.00", ctx["deuda"]);
        Assert.Equal("1", ctx["meses_pendientes"]);
        Assert.Contains("149.00", ctx["meses_deuda_detalle"]);
    }

    [Theory]
    [InlineData(InvoiceStatus.Pagada)]
    [InlineData(InvoiceStatus.Anulada)]
    public async Task ContextoDePlantilla_FacturaLiquidada_NoSumaDeuda(InvoiceStatus status)
    {
        var seeded = await SeedAsync(Inv(month: 8, status: status, paid: 149m));
        using var scope = seeded.Scope;

        var builder = scope.ServiceProvider.GetRequiredService<NotifContextBuilderService>();
        var ctx     = await builder.BuildAsync(seeded.ClientId);

        Assert.Equal("0.00", ctx["deuda"]);
    }

    [Fact]
    public async Task ContextoDePlantilla_FacturaAbonadaAMedias_SumaSoloElRemanente()
    {
        var seeded = await SeedAsync(
            Inv(month: 7, status: InvoiceStatus.Vencida, diasHastaVencimiento: -30),
            Inv(month: 8, status: InvoiceStatus.Emitida, paid: 100m));
        using var scope = seeded.Scope;

        var builder = scope.ServiceProvider.GetRequiredService<NotifContextBuilderService>();
        var ctx     = await builder.BuildAsync(seeded.ClientId);

        Assert.Equal("198.00", ctx["deuda"]);   // 149 vencidos + 49 remanentes
        Assert.Equal("2", ctx["meses_pendientes"]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // BUG-07 — el job de marcado de vencidas
    // ════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData(InvoiceStatus.Pendiente)]
    [InlineData(InvoiceStatus.Emitida)]
    [InlineData(InvoiceStatus.Enviada)]
    [InlineData(InvoiceStatus.ParcialmentePagada)]   // ← el estado del bug
    public async Task MarcadoDeVencidas_FacturaImpagaConPlazoCumplido_PasaAVencida(InvoiceStatus status)
    {
        var seeded = await SeedAsync(
            Inv(month: 7, status: status, paid: status == InvoiceStatus.ParcialmentePagada ? 50m : 0m,
                diasHastaVencimiento: -1));
        using var scope = seeded.Scope;

        var billing = scope.ServiceProvider.GetRequiredService<BillingService>();
        var marcadas = await billing.MarkOverdueInvoicesAsync();

        Assert.Equal(1, marcadas);

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invoice = await db.Set<Invoice>().AsNoTracking().SingleAsync();
        Assert.Equal(InvoiceStatus.Vencida, invoice.Status);
    }

    [Fact]
    public async Task MarcadoDeVencidas_FacturaAbonadaAMedias_ConservaLoAbonado()
    {
        var seeded = await SeedAsync(
            Inv(month: 7, status: InvoiceStatus.ParcialmentePagada, paid: 50m, diasHastaVencimiento: -1));
        using var scope = seeded.Scope;

        await scope.ServiceProvider.GetRequiredService<BillingService>().MarkOverdueInvoicesAsync();

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invoice = await db.Set<Invoice>().AsNoTracking().SingleAsync();

        Assert.Equal(50m, invoice.AmountPaid);
        Assert.Equal(99m, invoice.Outstanding);
    }

    [Theory]
    [InlineData(InvoiceStatus.Pagada)]
    [InlineData(InvoiceStatus.Anulada)]
    public async Task MarcadoDeVencidas_FacturaLiquidada_NoSeToca(InvoiceStatus status)
    {
        var seeded = await SeedAsync(
            Inv(month: 7, status: status, paid: 149m, diasHastaVencimiento: -1));
        using var scope = seeded.Scope;

        var marcadas = await scope.ServiceProvider
            .GetRequiredService<BillingService>().MarkOverdueInvoicesAsync();

        Assert.Equal(0, marcadas);

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(status, (await db.Set<Invoice>().AsNoTracking().SingleAsync()).Status);
    }

    [Fact]
    public async Task MarcadoDeVencidas_FacturaDentroDePlazo_NoSeToca()
    {
        var seeded = await SeedAsync(
            Inv(month: 8, status: InvoiceStatus.Emitida, diasHastaVencimiento: 2));
        using var scope = seeded.Scope;

        var marcadas = await scope.ServiceProvider
            .GetRequiredService<BillingService>().MarkOverdueInvoicesAsync();

        Assert.Equal(0, marcadas);
    }
}
