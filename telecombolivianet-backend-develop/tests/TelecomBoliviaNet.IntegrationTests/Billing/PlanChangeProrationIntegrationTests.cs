using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Billing;

/// <summary>
/// Auditoría 2026-08-06 — BUG-03, verificado de extremo a extremo contra PostgreSQL real.
///
/// Escenario: el cliente pide un upgrade el día 20 y el admin lo aprueba de inmediato. Para
/// entonces la mensualidad del mes ya venció (pasa a Vencida el día 6). El filtro de anulación
/// cubría solo Pendiente|Emitida|Enviada, así que esa mensualidad NO se anulaba y el cliente
/// quedaba con el mes completo MÁS las dos prorratas del mismo periodo.
///
/// Este test recorre el caso de uso completo (PlanChangeService → InvoiceProrationService →
/// ICreditLedger → transacción real) en vez de la unidad aislada: es la única forma de
/// comprobar que la anulación, las prorratas y la devolución del saldo se confirman juntas.
/// </summary>
public class PlanChangeProrationIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public PlanChangeProrationIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private const decimal PrecioCobre = 99m;
    private const decimal PrecioOro   = 199m;

    private sealed record Escenario(IServiceScope Scope, Guid ClientId, Guid CambioId, DateTime Hoy);

    /// <summary>
    /// Cliente con Plan Cobre, la mensualidad del mes en el estado indicado y una solicitud de
    /// upgrade a Plan Oro pendiente de aprobación.
    /// </summary>
    private async Task<Escenario> SeedAsync(InvoiceStatus estadoMensualidad, decimal abonado = 0m)
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync(
            """
            DELETE FROM "NotifLogs";
            DELETE FROM "NotifOutbox";
            DELETE FROM "InternalAlerts";
            DELETE FROM "PlanChangeRequests";
            DELETE FROM "SupportTickets";
            DELETE FROM "Invoices";
            DELETE FROM "CreditMovements";
            DELETE FROM "Clients";
            DELETE FROM "Plans";
            DELETE FROM "UserSystems";
            """);

        var userId  = Guid.NewGuid();
        var cobreId = Guid.NewGuid();
        var oroId   = Guid.NewGuid();

        db.Set<UserSystem>().Add(new UserSystem
        {
            Id = userId, FullName = "Admin Test", Email = $"admin-{userId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Admin, Status = UserStatus.Activo,
        });
        db.Set<Plan>().AddRange(
            new Plan { Id = cobreId, Name = "Plan Cobre", SpeedMb = 30, MonthlyPrice = PrecioCobre, IsActive = true },
            new Plan { Id = oroId,   Name = "Plan Oro",   SpeedMb = 80, MonthlyPrice = PrecioOro,   IsActive = true });

        var client = Client.Create(
            tbnCode: "TBN-9100", fullName: "Cliente Prorrata", identityCard: "9100001",
            phoneMain: "59171000100", zone: "Zona Sur",
            installationDate: DateTime.UtcNow.AddMonths(-8),
            installedByUserId: userId, planId: cobreId);
        client.WinboxNumber = "WB-9100";
        db.Set<Client>().Add(client);

        var hoy = DateTime.UtcNow;
        db.Set<Invoice>().Add(new Invoice
        {
            Id       = Guid.NewGuid(), ClientId = client.Id,
            Type     = InvoiceType.Mensualidad,
            Status   = estadoMensualidad,
            Year     = hoy.Year, Month = hoy.Month,
            Amount   = PrecioCobre, AmountPaid = abonado,
            IssuedAt = new DateTime(hoy.Year, hoy.Month, 1, 0, 0, 0, DateTimeKind.Utc),
            DueDate  = new DateTime(hoy.Year, hoy.Month, 5, 0, 0, 0, DateTimeKind.Utc),
            InvoiceNumber = "F-2026-9100",
        });

        var cambio = new PlanChangeRequest
        {
            Id            = Guid.NewGuid(),
            ClientId      = client.Id,
            OldPlanId     = cobreId,
            NewPlanId     = oroId,
            Status        = PlanChangeStatus.Pendiente,
            EffectiveDate = hoy,
            RequestedAt   = hoy,
            RequestedById = userId,
        };
        db.Set<PlanChangeRequest>().Add(cambio);

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Escenario(scope, client.Id, cambio.Id, hoy);
    }

    private static async Task<List<Invoice>> FacturasDelMesAsync(IServiceScope scope, Guid clientId)
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Set<Invoice>().AsNoTracking()
            .Where(i => i.ClientId == clientId)
            .ToListAsync();
    }

    // ════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData(InvoiceStatus.Emitida)]
    [InlineData(InvoiceStatus.Vencida)]              // ← el estado del bug
    [InlineData(InvoiceStatus.ParcialmentePagada)]   // ← el estado del bug
    public async Task UpgradeAMitadDeMes_NoDejaLaMensualidadViva(InvoiceStatus estado)
    {
        var esc = await SeedAsync(estado, abonado: estado == InvoiceStatus.ParcialmentePagada ? 40m : 0m);
        using var scope = esc.Scope;

        var svc = scope.ServiceProvider.GetRequiredService<IPlanChangeService>();
        var result = await svc.ApproveChangeAsync(
            esc.CambioId, midMonth: true, Guid.NewGuid(), "Admin", "127.0.0.1");

        Assert.True(result.IsSuccess, result.ErrorMessage);

        var facturas    = await FacturasDelMesAsync(scope, esc.ClientId);
        var mensualidad = facturas.Single(i => i.Type == InvoiceType.Mensualidad);

        Assert.Equal(InvoiceStatus.Anulada, mensualidad.Status);
    }

    [Fact]
    public async Task UpgradeAMitadDeMes_MensualidadVencida_NoCobraElMesDosVeces()
    {
        var esc = await SeedAsync(InvoiceStatus.Vencida);
        using var scope = esc.Scope;

        await scope.ServiceProvider.GetRequiredService<IPlanChangeService>()
            .ApproveChangeAsync(esc.CambioId, midMonth: true, Guid.NewGuid(), "Admin", "127.0.0.1");

        var vigentes = (await FacturasDelMesAsync(scope, esc.ClientId))
            .Where(i => i.Status != InvoiceStatus.Anulada)
            .Sum(i => i.Amount);

        // Con el bug: 99 (mensualidad viva) + prorratas. Sin él: solo las dos prorratas,
        // que por construcción nunca superan el precio del plan más caro del mes.
        Assert.True(vigentes < PrecioCobre + PrecioOro,
            $"el mes quedó cobrado dos veces: Bs. {vigentes:F2}");
        Assert.True(vigentes <= PrecioOro,
            $"las prorratas de un mes no pueden superar la mensualidad del plan nuevo: Bs. {vigentes:F2}");
    }

    [Fact]
    public async Task UpgradeAMitadDeMes_GeneraLasDosProrratasDelMes()
    {
        var esc = await SeedAsync(InvoiceStatus.Vencida);
        using var scope = esc.Scope;

        await scope.ServiceProvider.GetRequiredService<IPlanChangeService>()
            .ApproveChangeAsync(esc.CambioId, midMonth: true, Guid.NewGuid(), "Admin", "127.0.0.1");

        var facturas = await FacturasDelMesAsync(scope, esc.ClientId);

        Assert.Single(facturas.Where(i => i.Type == InvoiceType.ProrrataAnterior && i.Status != InvoiceStatus.Anulada));
        Assert.Single(facturas.Where(i => i.Type == InvoiceType.ProrrataNueva    && i.Status != InvoiceStatus.Anulada));
    }

    [Fact]
    public async Task UpgradeAMitadDeMes_MensualidadConAbono_DevuelveElDineroComoSaldoAFavor()
    {
        var esc = await SeedAsync(InvoiceStatus.ParcialmentePagada, abonado: 40m);
        using var scope = esc.Scope;

        await scope.ServiceProvider.GetRequiredService<IPlanChangeService>()
            .ApproveChangeAsync(esc.CambioId, midMonth: true, Guid.NewGuid(), "Admin", "127.0.0.1");

        var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var client = await db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ClientId);

        Assert.Equal(40m, client.CreditBalance);

        // El asiento tiene que existir: un saldo sin movimiento que lo explique es un descuadre.
        var movimiento = await db.Set<CreditMovement>().AsNoTracking()
            .SingleAsync(m => m.ClientId == esc.ClientId);
        Assert.Equal(CreditMovementType.Reversion, movimiento.Type);
        Assert.Equal(40m, movimiento.Amount);
        Assert.Equal(40m, movimiento.BalanceAfter);
    }

    [Fact]
    public async Task UpgradeAMitadDeMes_MensualidadYaPagada_NoSeAnulaNiSeDevuelveNada()
    {
        var esc = await SeedAsync(InvoiceStatus.Pagada, abonado: PrecioCobre);
        using var scope = esc.Scope;

        await scope.ServiceProvider.GetRequiredService<IPlanChangeService>()
            .ApproveChangeAsync(esc.CambioId, midMonth: true, Guid.NewGuid(), "Admin", "127.0.0.1");

        var db          = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var mensualidad = (await FacturasDelMesAsync(scope, esc.ClientId))
            .Single(i => i.Type == InvoiceType.Mensualidad);
        var client      = await db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ClientId);

        Assert.Equal(InvoiceStatus.Pagada, mensualidad.Status);
        Assert.Equal(0m, client.CreditBalance);
    }
}
