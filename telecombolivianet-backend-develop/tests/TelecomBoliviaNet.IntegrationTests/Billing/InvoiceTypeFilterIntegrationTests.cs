using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Billing;

/// <summary>
/// Auditoría 2026-08-06 — BUG-13, verificado contra PostgreSQL real.
///
/// El módulo de Facturación forzaba <c>Type == Mensualidad</c> en el listado y en los totales,
/// así que las facturas extraordinarias (reconexión, equipo, visita técnica) y las de instalación
/// no aparecían en la pantalla NI en el facturado/cobrado/pendiente: dinero emitido que el
/// módulo de facturación simplemente no mostraba. Ahora el tipo es un filtro y por defecto
/// se muestran todas.
/// </summary>
public class InvoiceTypeFilterIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public InvoiceTypeFilterIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private const int Anio = 2026;
    private const int Mes  = 8;

    /// <summary>Un cliente con tres facturas del mismo mes: mensualidad, extraordinaria e instalación.</summary>
    private async Task<IServiceScope> SeedAsync()
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

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

        var userId = Guid.NewGuid();
        var planId = Guid.NewGuid();

        db.Set<UserSystem>().Add(new UserSystem
        {
            Id = userId, FullName = "Admin", Email = $"a-{userId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Admin, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = planId, Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149m, IsActive = true,
        });

        var client = Client.Create(
            tbnCode: "TBN-9400", fullName: "Cliente Tipos", identityCard: "9400001",
            phoneMain: "59171000400", zone: "Centro",
            installationDate: new DateTime(Anio, Mes, 1, 0, 0, 0, DateTimeKind.Utc),
            installedByUserId: userId, planId: planId);
        client.WinboxNumber = "WB-9400";
        db.Set<Client>().Add(client);

        db.Set<Invoice>().AddRange(
            NewInvoice(client.Id, InvoiceType.Mensualidad,    149m),
            NewInvoice(client.Id, InvoiceType.Extraordinaria, 200m),
            NewInvoice(client.Id, InvoiceType.Instalacion,    350m));

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return scope;
    }

    private static Invoice NewInvoice(Guid clientId, InvoiceType type, decimal amount) => new()
    {
        Id       = Guid.NewGuid(), ClientId = clientId, Type = type,
        Status   = InvoiceStatus.Emitida,
        Year     = Anio, Month = Mes, Amount = amount,
        IssuedAt = new DateTime(Anio, Mes, 1, 0, 0, 0, DateTimeKind.Utc),
        DueDate  = new DateTime(Anio, Mes, 5, 0, 0, 0, DateTimeKind.Utc),
        InvoiceNumber = $"F-{type}-{amount:F0}",
    };

    private static IInvoiceQueryService Svc(IServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<IInvoiceQueryService>();

    // F5: los totales se mudaron a su propio servicio; la grilla se queda aquí.
    private static IInvoiceStatsService Stats(IServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<IInvoiceStatsService>();

    // ── Listado ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task SinFiltroDeTipo_ElListadoMuestraTodasLasFacturas()
    {
        using var scope = await SeedAsync();

        var page = await Svc(scope).GetPagedAsync(new InvoiceFilterDto(Year: Anio, Month: Mes));

        Assert.Equal(3, page.TotalCount);
    }

    [Theory]
    [InlineData("Mensualidad",    149)]
    [InlineData("Extraordinaria", 200)]
    [InlineData("Instalacion",    350)]
    public async Task ConFiltroDeTipo_ElListadoMuestraSoloEseTipo(string tipo, int montoEsperado)
    {
        using var scope = await SeedAsync();

        var page = await Svc(scope).GetPagedAsync(
            new InvoiceFilterDto(Year: Anio, Month: Mes, Type: tipo));

        var item = Assert.Single(page.Items);
        Assert.Equal(montoEsperado, item.Amount);
    }

    [Fact]
    public async Task FiltroAll_EquivaleASinFiltro()
    {
        using var scope = await SeedAsync();

        var page = await Svc(scope).GetPagedAsync(
            new InvoiceFilterDto(Year: Anio, Month: Mes, Type: "all"));

        Assert.Equal(3, page.TotalCount);
    }

    // ── Totales ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task SinFiltroDeTipo_LosTotalesIncluyenTodoLoFacturado()
    {
        using var scope = await SeedAsync();

        var stats = await Stats(scope).GetMonthStatsAsync(Anio, Mes);

        Assert.Equal(699m, stats.TotalBilled);   // 149 + 200 + 350
        Assert.Equal(699m, stats.TotalPending);
        Assert.Equal(3, stats.CountBilled);
    }

    [Fact]
    public async Task ConFiltroMensualidad_LosTotalesSeAcotanAEseTipo()
    {
        using var scope = await SeedAsync();

        var stats = await Stats(scope).GetMonthStatsAsync(Anio, Mes, "Mensualidad");

        Assert.Equal(149m, stats.TotalBilled);
        Assert.Equal(1, stats.CountBilled);
    }

    [Fact]
    public async Task RangoSinFiltroDeTipo_IncluyeTodoLoFacturado()
    {
        using var scope = await SeedAsync();

        var stats = await Stats(scope).GetRangeStatsAsync(
            new DateTime(Anio, Mes, 1), new DateTime(Anio, Mes, 28));

        Assert.Equal(699m, stats.TotalBilled);
    }

    [Fact]
    public async Task TipoDesconocido_NoFiltra_EnVezDeDevolverVacio()
    {
        using var scope = await SeedAsync();

        var page = await Svc(scope).GetPagedAsync(
            new InvoiceFilterDto(Year: Anio, Month: Mes, Type: "NoExiste"));

        Assert.Equal(3, page.TotalCount);
    }
}
