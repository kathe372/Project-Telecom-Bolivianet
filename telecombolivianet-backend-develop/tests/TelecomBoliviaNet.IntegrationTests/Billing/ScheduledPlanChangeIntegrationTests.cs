using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;
using TelecomBoliviaNet.Infrastructure.Jobs;

namespace TelecomBoliviaNet.IntegrationTests.Billing;

/// <summary>
/// Auditoría 2026-08-06 — BUG-12, verificado contra PostgreSQL real.
///
/// La política comercial es upgrade inmediato / downgrade a fin de mes, y el ticket promete
/// "efectivo el 1ro del mes siguiente". Pero aprobar ejecutaba <c>ChangePlan</c> igual y NADA
/// procesaba <c>EffectiveDate</c>: el cliente perdía la velocidad ese mismo día habiendo pagado
/// el mes completo del plan superior.
///
/// El ciclo cruza dos componentes (PlanChangeService aprueba, ApplyScheduledPlanChangesJob
/// aplica) y se apoya en el estado persistido, así que solo tiene sentido probarlo entero.
/// </summary>
public class ScheduledPlanChangeIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public ScheduledPlanChangeIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private sealed record Escenario(
        IServiceScope Scope, Guid ClientId, Guid CambioId, Guid PlanCobreId, Guid PlanOroId, Guid ActorId);

    /// <param name="effectiveDate">Fecha efectiva del cambio solicitado (downgrade a fin de mes).</param>
    private async Task<Escenario> SeedAsync(DateTime effectiveDate)
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync(
            """
            DELETE FROM "NotifLogs";
            DELETE FROM "NotifOutbox";
            DELETE FROM "InternalAlerts";
            DELETE FROM "AuditLogs";
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
            new Plan { Id = oroId,   Name = "Plan Oro",   SpeedMb = 80, MonthlyPrice = 199m, IsActive = true },
            new Plan { Id = cobreId, Name = "Plan Cobre", SpeedMb = 30, MonthlyPrice = 99m,  IsActive = true });

        // Downgrade: hoy tiene Oro y pide Cobre.
        var client = Client.Create(
            tbnCode: "TBN-9300", fullName: "Cliente Downgrade", identityCard: "9300001",
            phoneMain: "59171000300", zone: "Zona Oeste",
            installationDate: DateTime.UtcNow.AddMonths(-10),
            installedByUserId: userId, planId: oroId);
        client.WinboxNumber = "WB-9300";
        db.Set<Client>().Add(client);

        var cambio = new PlanChangeRequest
        {
            Id            = Guid.NewGuid(),
            ClientId      = client.Id,
            OldPlanId     = oroId,
            NewPlanId     = cobreId,
            Status        = PlanChangeStatus.Pendiente,
            EffectiveDate = effectiveDate,
            RequestedAt   = DateTime.UtcNow,
            RequestedById = userId,
        };
        db.Set<PlanChangeRequest>().Add(cambio);

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Escenario(scope, client.Id, cambio.Id, cobreId, oroId, userId);
    }

    private static Task AprobarDiferidoAsync(Escenario esc) =>
        esc.Scope.ServiceProvider.GetRequiredService<IPlanChangeService>()
            .ApproveChangeAsync(esc.CambioId, midMonth: false, esc.ActorId, "Admin", "127.0.0.1");

    private static Task<int> CorrerJobAsync(Escenario esc)
    {
        var db  = esc.Scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var job = new ApplyScheduledPlanChangesJob(
            esc.Scope.ServiceProvider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<ApplyScheduledPlanChangesJob>.Instance);
        return job.RunAsync(esc.Scope, db);
    }

    private static async Task<Client> LeerClienteAsync(Escenario esc)
    {
        var db = esc.Scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.ChangeTracker.Clear();
        return await db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ClientId);
    }

    private static async Task<PlanChangeRequest> LeerCambioAsync(Escenario esc)
    {
        var db = esc.Scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.ChangeTracker.Clear();
        return await db.Set<PlanChangeRequest>().AsNoTracking().SingleAsync(r => r.Id == esc.CambioId);
    }

    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task AprobarDowngrade_NoCambiaElPlanHastaLaFechaEfectiva()
    {
        var esc = await SeedAsync(effectiveDate: DateTime.UtcNow.AddDays(11));
        using var scope = esc.Scope;

        await AprobarDiferidoAsync(esc);

        (await LeerClienteAsync(esc)).PlanId.Should().Be(esc.PlanOroId,
            "el cliente pagó el mes completo del plan superior");
        (await LeerCambioAsync(esc)).Status.Should().Be(PlanChangeStatus.Aprobado);
    }

    [Fact]
    public async Task JobAntesDeLaFechaEfectiva_NoAplicaNada()
    {
        var esc = await SeedAsync(effectiveDate: DateTime.UtcNow.AddDays(11));
        using var scope = esc.Scope;

        await AprobarDiferidoAsync(esc);
        var aplicados = await CorrerJobAsync(esc);

        aplicados.Should().Be(0);
        (await LeerClienteAsync(esc)).PlanId.Should().Be(esc.PlanOroId);
    }

    [Fact]
    public async Task JobEnLaFechaEfectiva_AplicaElCambioYLoMarcaAplicado()
    {
        var esc = await SeedAsync(effectiveDate: DateTime.UtcNow.AddMinutes(-1));
        using var scope = esc.Scope;

        await AprobarDiferidoAsync(esc);
        var aplicados = await CorrerJobAsync(esc);

        aplicados.Should().Be(1);
        (await LeerClienteAsync(esc)).PlanId.Should().Be(esc.PlanCobreId);
        (await LeerCambioAsync(esc)).Status.Should().Be(PlanChangeStatus.Aplicado);
    }

    [Fact]
    public async Task JobEsIdempotente_UnaSegundaCorridaNoVuelveAAplicar()
    {
        var esc = await SeedAsync(effectiveDate: DateTime.UtcNow.AddMinutes(-1));
        using var scope = esc.Scope;

        await AprobarDiferidoAsync(esc);
        await CorrerJobAsync(esc);
        var segunda = await CorrerJobAsync(esc);

        segunda.Should().Be(0, "el estado Aplicado saca la solicitud del conjunto pendiente");
        (await LeerClienteAsync(esc)).PlanId.Should().Be(esc.PlanCobreId);
    }

    [Fact]
    public async Task JobNoTocaSolicitudesQueNoFueronAprobadas()
    {
        var esc = await SeedAsync(effectiveDate: DateTime.UtcNow.AddMinutes(-1));
        using var scope = esc.Scope;

        // Sin aprobar: sigue Pendiente aunque su fecha efectiva ya pasó.
        var aplicados = await CorrerJobAsync(esc);

        aplicados.Should().Be(0);
        (await LeerClienteAsync(esc)).PlanId.Should().Be(esc.PlanOroId);
        (await LeerCambioAsync(esc)).Status.Should().Be(PlanChangeStatus.Pendiente);
    }

    [Fact]
    public async Task JobAlAplicar_AvisaAlClienteYDejaRastroEnAuditoria()
    {
        var esc = await SeedAsync(effectiveDate: DateTime.UtcNow.AddMinutes(-1));
        using var scope = esc.Scope;

        await AprobarDiferidoAsync(esc);
        await CorrerJobAsync(esc);

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var auditoria = await db.AuditLogs.AsNoTracking()
            .Where(a => a.Action == "PLAN_CHANGE_APPLIED")
            .ToListAsync();
        auditoria.Should().ContainSingle();
        auditoria[0].Description.Should().Contain("Plan Cobre");
    }
}
