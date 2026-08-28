using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Billing;

/// <summary>
/// F7.4 — <c>GetBillingPreviewAsync</c> pasó de contar en memoria a agregar en SQL.
///
/// <para>El plan daba por hecho que la caracterización de F0 cubría este método.
/// <b>No lo cubría nadie</b>: se reescribió una consulta sin un solo test que
/// dijera qué números tenía que devolver. Estos tests son esa red, y viven en
/// integración a propósito — la traducción de un <c>GroupBy</c> con conteos
/// condicionales y una subconsulta no se comprueba con LINQ a objetos.</para>
/// </summary>
public class BillingPreviewIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public BillingPreviewIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private const int     Anio       = 2026;
    private const int     Mes        = 3;
    private const decimal PrecioPlan = 149m;

    private static readonly Guid PlanId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    private sealed record Escenario(IServiceScope Scope, AppDbContext Db);

    private async Task<Escenario> SeedAsync(params (ClientStatus Estado, bool YaFacturado)[] clientes)
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync("""
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
            Id = UserId, FullName = "Operador Preview", Email = $"prev-{UserId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Operador, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = PlanId, Name = "Plan Plata", SpeedMb = 50,
            MonthlyPrice = PrecioPlan, IsActive = true,
        });

        // Muy anterior al mes facturado: sin prorrateo de por medio.
        var instalacion = new DateTime(2025, 6, 15, 0, 0, 0, DateTimeKind.Utc);

        var n = 0;
        foreach (var (estado, yaFacturado) in clientes)
        {
            n++;
            var c = Client.Create(
                tbnCode: $"TBN-{5000 + n}", fullName: $"Cliente {n}",
                identityCard: $"CI-{5000 + n}", phoneMain: $"5917100{5000 + n}",
                zone: "Zona Norte", installationDate: instalacion,
                installedByUserId: UserId, planId: PlanId);
            c.WinboxNumber = $"WB-{5000 + n}";

            // El estado se cambia por los métodos del dominio, que es lo único
            // que la entidad permite: el setter es privado a propósito.
            if (estado == ClientStatus.Suspendido) c.Suspend();
            if (estado == ClientStatus.DadoDeBaja) c.Cancel();
            db.Set<Client>().Add(c);

            if (yaFacturado)
                db.Set<Invoice>().Add(new Invoice
                {
                    Id = Guid.NewGuid(), ClientId = c.Id,
                    Type = InvoiceType.Mensualidad, Status = InvoiceStatus.Emitida,
                    Year = Anio, Month = Mes, Amount = PrecioPlan,
                    IssuedAt = DateTime.UtcNow, DueDate = DateTime.UtcNow.AddDays(5),
                });
        }

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return new Escenario(scope, db);
    }

    private static IBillingService Svc(Escenario e) =>
        e.Scope.ServiceProvider.GetRequiredService<IBillingService>();

    [Fact]
    public async Task CuentaLosQueFaltanPorFacturar_YSuTotal()
    {
        var e = await SeedAsync(
            (ClientStatus.Activo, false),
            (ClientStatus.Activo, false),
            (ClientStatus.Activo, false));
        using var scope = e.Scope;

        var preview = await Svc(e).GetBillingPreviewAsync(Anio, Mes);

        preview.ToGenerate.Should().Be(3);
        preview.EstimatedTotal.Should().Be(3 * PrecioPlan);
        preview.AlreadyBilled.Should().Be(0);
    }

    [Fact]
    public async Task LosQueYaTienenFacturaDelMes_NoSeVuelvenAContar()
    {
        var e = await SeedAsync(
            (ClientStatus.Activo, true),
            (ClientStatus.Activo, true),
            (ClientStatus.Activo, false));
        using var scope = e.Scope;

        var preview = await Svc(e).GetBillingPreviewAsync(Anio, Mes);

        preview.AlreadyBilled.Should().Be(2);
        preview.ToGenerate.Should().Be(1);
        preview.EstimatedTotal.Should().Be(PrecioPlan,
            "el total estima lo que falta por emitir, no lo ya emitido");
    }

    [Fact]
    public async Task LosSuspendidos_NoEntranEnLaFacturacion()
    {
        // Congelamiento (regla 2026-07-07): a un suspendido no se le factura.
        var e = await SeedAsync(
            (ClientStatus.Activo,     false),
            (ClientStatus.Suspendido, false));
        using var scope = e.Scope;

        var preview = await Svc(e).GetBillingPreviewAsync(Anio, Mes);

        preview.ToGenerate.Should().Be(1);
        preview.EstimatedTotal.Should().Be(PrecioPlan);
    }

    [Fact]
    public async Task LosDadosDeBaja_SeCuentanAparteYNoSeFacturan()
    {
        var e = await SeedAsync(
            (ClientStatus.Activo,     false),
            (ClientStatus.DadoDeBaja, false),
            (ClientStatus.DadoDeBaja, false));
        using var scope = e.Scope;

        var preview = await Svc(e).GetBillingPreviewAsync(Anio, Mes);

        preview.ToGenerate.Should().Be(1);
        preview.ExcludedBaja.Should().Be(2);
    }

    [Fact]
    public async Task SinNingunCliente_DevuelveCerosYNoRevienta()
    {
        // El GroupBy sobre un conjunto vacío no devuelve fila: sin el manejo del
        // null, esto sería una NullReferenceException en una pantalla de consulta.
        var e = await SeedAsync();
        using var scope = e.Scope;

        var preview = await Svc(e).GetBillingPreviewAsync(Anio, Mes);

        preview.ToGenerate.Should().Be(0);
        preview.AlreadyBilled.Should().Be(0);
        preview.WithErrors.Should().Be(0);
        preview.EstimatedTotal.Should().Be(0m);
    }

    [Fact]
    public async Task ClientesSinPlan_SiempreCero()
    {
        // D-08: la FK Clients→Plans hace inalcanzable la rama "cliente sin plan".
        // El contador existe en el DTO y nunca se moverá; queda fijado para que si
        // algún día se mueve, alguien se entere.
        var e = await SeedAsync((ClientStatus.Activo, false));
        using var scope = e.Scope;

        var preview = await Svc(e).GetBillingPreviewAsync(Anio, Mes);

        preview.WithErrors.Should().Be(0);
    }
}
