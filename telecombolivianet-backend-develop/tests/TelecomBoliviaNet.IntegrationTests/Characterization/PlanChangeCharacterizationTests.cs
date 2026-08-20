using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Characterization;

/// <summary>
/// TEST DE CARACTERIZACIÓN — Fase 0.
///
/// Congela la regla comercial de cambio de plan tal y como está implementada hoy:
///   - <b>Upgrade</b> (plan más caro): puede aplicarse de inmediato, con prorrata.
///   - <b>Downgrade</b> (igual o menor precio): va a fin de mes, sin excepción.
///
/// Y, sobre todo, congela la distinción entre APROBADO y APLICADO: aprobar un
/// downgrade NO puede tocar el plan del cliente. Antes sí lo hacía, y el cliente
/// perdía la velocidad el mismo día habiendo pagado el mes completo del plan
/// superior. El cambio diferido lo ejecuta ApplyScheduledPlanChangesJob cuando
/// llega EffectiveDate.
///
/// Protege F5, que parte PlanChangeService (386 líneas, 12 dependencias) en
/// cuatro handlers. Es el refactor con más riesgo de perder una rama por el
/// camino, porque el servicio tiene cuatro `catch (Exception)`.
/// </summary>
public class PlanChangeCharacterizationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public PlanChangeCharacterizationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private const decimal PrecioBasico  = 99m;
    private const decimal PrecioPremium = 199m;

    private sealed record Escenario(
        IServiceScope Scope, AppDbContext Db, Guid ClientId, Guid ActorId,
        Guid PlanBasico, Guid PlanPremium);

    /// <summary>Cliente en el plan básico, con un plan premium disponible al que moverse.</summary>
    private async Task<Escenario> SeedAsync()
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync("""
            DELETE FROM "NotifLogs";
            DELETE FROM "NotifOutbox";
            DELETE FROM "PlanChangeRequests";
            DELETE FROM "TicketWorkLogs";
            DELETE FROM "TicketComments";
            DELETE FROM "SupportTickets";
            DELETE FROM "PaymentInvoices";
            DELETE FROM "Payments";
            DELETE FROM "Invoices";
            DELETE FROM "CreditMovements";
            DELETE FROM "Clients";
            DELETE FROM "Plans";
            DELETE FROM "UserSystems";
            """);

        var userId  = Guid.NewGuid();
        var basico  = Guid.NewGuid();
        var premium = Guid.NewGuid();

        db.Set<UserSystem>().Add(new UserSystem
        {
            Id = userId, FullName = "Admin Caracterización",
            Email = $"plan-{userId:N}@test.bo", PasswordHash = "x",
            Role = UserRole.Admin, Status = UserStatus.Activo,
        });
        db.Set<Plan>().AddRange(
            new Plan { Id = basico,  Name = "Plan Cobre", SpeedMb = 30, MonthlyPrice = PrecioBasico,  IsActive = true },
            new Plan { Id = premium, Name = "Plan Oro",   SpeedMb = 80, MonthlyPrice = PrecioPremium, IsActive = true });

        var client = Client.Create("TBN-P001", "Cliente Cambio Plan", "7100001", "59171000400",
                                   "Zona Central", DateTime.UtcNow.AddMonths(-8), userId, basico);
        client.WinboxNumber = "WB-P001";
        db.Set<Client>().Add(client);

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Escenario(scope, db, client.Id, userId, basico, premium);
    }

    private static IPlanChangeService Svc(Escenario esc) =>
        esc.Scope.ServiceProvider.GetRequiredService<IPlanChangeService>();

    private static async Task<Guid> SolicitarAsync(Escenario esc, Guid nuevoPlan)
    {
        var res = await Svc(esc).RequestChangeAsync(
            esc.ClientId, nuevoPlan, "Solicitud de caracterización",
            esc.ActorId, "Admin Caracterización", "::1");
        res.IsSuccess.Should().BeTrue(res.ErrorMessage);
        esc.Db.ChangeTracker.Clear();
        return res.Value;
    }

    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Solicitar_un_cambio_lo_deja_pendiente_y_efectivo_el_mes_siguiente()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var cambioId = await SolicitarAsync(esc, esc.PlanPremium);

        var cambio = await esc.Db.Set<PlanChangeRequest>().AsNoTracking().SingleAsync(c => c.Id == cambioId);
        cambio.Status.Should().Be(PlanChangeStatus.Pendiente);
        cambio.OldPlanId.Should().Be(esc.PlanBasico);
        cambio.NewPlanId.Should().Be(esc.PlanPremium);
        cambio.MidMonthChange.Should().BeFalse();

        // La fecha efectiva por defecto es el día 1 del mes siguiente, se pida lo
        // que se pida. Solo la aprobación inmediata la adelanta.
        var hoy = DateTime.UtcNow;
        var primeroDelMesSiguiente = new DateTime(hoy.Year, hoy.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);
        cambio.EffectiveDate.Should().Be(primeroDelMesSiguiente);

        // El plan del cliente NO se toca al solicitar.
        var cliente = await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ClientId);
        cliente.PlanId.Should().Be(esc.PlanBasico);
    }

    [Fact]
    public async Task Solicitar_un_cambio_abre_un_ticket_de_seguimiento()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var cambioId = await SolicitarAsync(esc, esc.PlanPremium);

        var cambio = await esc.Db.Set<PlanChangeRequest>().AsNoTracking().SingleAsync(c => c.Id == cambioId);
        cambio.TicketId.Should().NotBeNull();

        var ticket = await esc.Db.Set<SupportTicket>().AsNoTracking()
            .SingleAsync(t => t.Id == cambio.TicketId!.Value);
        ticket.Type.Should().Be(TicketType.CambioPlan);
        ticket.Status.Should().Be(TicketStatus.Abierto);
        ticket.ClientId.Should().Be(esc.ClientId);
    }

    [Fact]
    public async Task No_se_admite_una_segunda_solicitud_con_una_pendiente()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await SolicitarAsync(esc, esc.PlanPremium);

        var segunda = await Svc(esc).RequestChangeAsync(
            esc.ClientId, esc.PlanPremium, null, esc.ActorId, "Admin Caracterización", "::1");

        segunda.IsSuccess.Should().BeFalse();
        segunda.ErrorMessage.Should().Contain("pendiente");
    }

    [Fact]
    public async Task No_se_admite_cambiar_al_plan_que_ya_tiene()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var res = await Svc(esc).RequestChangeAsync(
            esc.ClientId, esc.PlanBasico, null, esc.ActorId, "Admin Caracterización", "::1");

        res.IsSuccess.Should().BeFalse();
        res.ErrorMessage.Should().Contain("ya tiene ese plan");
    }

    [Fact]
    public async Task Aprobar_un_UPGRADE_de_inmediato_cambia_el_plan_y_lo_marca_aplicado()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var cambioId = await SolicitarAsync(esc, esc.PlanPremium);   // 99 → 199 = upgrade

        var res = await Svc(esc).ApproveChangeAsync(
            cambioId, midMonth: true, esc.ActorId, "Admin Caracterización", "::1");

        res.IsSuccess.Should().BeTrue(res.ErrorMessage);
        esc.Db.ChangeTracker.Clear();

        var cambio = await esc.Db.Set<PlanChangeRequest>().AsNoTracking().SingleAsync(c => c.Id == cambioId);
        cambio.Status.Should().Be(PlanChangeStatus.Aplicado, "el inmediato se ejecuta en el acto");
        cambio.MidMonthChange.Should().BeTrue();
        cambio.ProcessedById.Should().Be(esc.ActorId);

        var cliente = await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ClientId);
        cliente.PlanId.Should().Be(esc.PlanPremium);
    }

    [Fact]
    public async Task Un_DOWNGRADE_no_puede_aplicarse_a_mitad_de_mes()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        // Se pone al cliente en premium para que moverlo a básico sea un downgrade.
        var cliente = await esc.Db.Set<Client>().SingleAsync(c => c.Id == esc.ClientId);
        cliente.ChangePlan(esc.PlanPremium);
        await esc.Db.SaveChangesAsync();
        esc.Db.ChangeTracker.Clear();

        var cambioId = await SolicitarAsync(esc, esc.PlanBasico);    // 199 → 99 = downgrade

        var res = await Svc(esc).ApproveChangeAsync(
            cambioId, midMonth: true, esc.ActorId, "Admin Caracterización", "::1");

        res.IsSuccess.Should().BeFalse();
        res.ErrorMessage.Should().Contain("fin de mes");
    }

    [Fact]
    public async Task Aprobar_un_DOWNGRADE_diferido_NO_toca_todavia_el_plan_del_cliente()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var cliente = await esc.Db.Set<Client>().SingleAsync(c => c.Id == esc.ClientId);
        cliente.ChangePlan(esc.PlanPremium);
        await esc.Db.SaveChangesAsync();
        esc.Db.ChangeTracker.Clear();

        var cambioId = await SolicitarAsync(esc, esc.PlanBasico);

        var res = await Svc(esc).ApproveChangeAsync(
            cambioId, midMonth: false, esc.ActorId, "Admin Caracterización", "::1");

        res.IsSuccess.Should().BeTrue(res.ErrorMessage);
        esc.Db.ChangeTracker.Clear();

        var cambio = await esc.Db.Set<PlanChangeRequest>().AsNoTracking().SingleAsync(c => c.Id == cambioId);
        cambio.Status.Should().Be(PlanChangeStatus.Aprobado,
            "Aprobado != Aplicado: el job lo ejecutará al llegar EffectiveDate");

        // LA aserción de este archivo: el cliente conserva su plan superior hasta
        // fin de mes, que es justo lo que se le prometió y lo que ya pagó.
        var despues = await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ClientId);
        despues.PlanId.Should().Be(esc.PlanPremium);
    }

    [Fact]
    public async Task Rechazar_un_cambio_lo_cierra_con_motivo()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var cambioId = await SolicitarAsync(esc, esc.PlanPremium);

        var res = await Svc(esc).RejectChangeAsync(
            cambioId, "El cliente tiene deuda pendiente", esc.ActorId, "Admin Caracterización", "::1");

        res.IsSuccess.Should().BeTrue(res.ErrorMessage);
        esc.Db.ChangeTracker.Clear();

        var cambio = await esc.Db.Set<PlanChangeRequest>().AsNoTracking().SingleAsync(c => c.Id == cambioId);
        cambio.Status.Should().Be(PlanChangeStatus.Rechazado);
        cambio.RejectionReason.Should().Be("El cliente tiene deuda pendiente");

        var cliente = await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ClientId);
        cliente.PlanId.Should().Be(esc.PlanBasico, "un rechazo no toca el plan");
    }
}
