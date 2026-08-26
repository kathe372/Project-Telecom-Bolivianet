using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Tickets;

/// <summary>
/// F4 — El listado de tickets, el informe de SLA vencido y el semáforo se
/// mudaron de los handlers a <see cref="ITicketRepository"/>.
///
/// <para>Dos cosas exigen PostgreSQL real para comprobarse. La primera es
/// <c>IgnoreQueryFilters</c>: el filtro global de SupportTicket mira el borrado
/// lógico del CLIENTE, no el del ticket, y sin saltárselo un ticket histórico
/// pierde el nombre de su cliente en cuanto a este se le da de baja. La segunda
/// es la proyección del semáforo, que se arma dentro del SELECT.</para>
/// </summary>
public class TicketRepositoryIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public TicketRepositoryIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private static readonly Guid PlanId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    private sealed record Fixture(IServiceScope Scope, ITicketRepository Repo, Guid ClientId);

    private async Task<Fixture> SeedAsync(
        Func<Guid, SupportTicket[]> tickets, bool clientDadoDeBaja = false)
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync(
            """
            DELETE FROM "TicketNotifications";
            DELETE FROM "TicketComments";
            DELETE FROM "TicketWorkLogs";
            DELETE FROM "TicketVisits";
            DELETE FROM "SupportTickets";
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
            Id = UserId, FullName = "Tecnico Rojas", Email = $"tec-{UserId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Tecnico, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = PlanId, Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149m, IsActive = true,
        });

        var client = Client.Create(
            tbnCode: "TBN-7001", fullName: "Cliente Tickets", identityCard: "7001001",
            phoneMain: "59171000700", zone: "Zona Norte",
            installationDate: DateTime.UtcNow.AddMonths(-6),
            installedByUserId: UserId, planId: PlanId);
        client.WinboxNumber = "WB-7001";
        client.IsDeleted    = clientDadoDeBaja;
        db.Set<Client>().Add(client);

        db.Set<SupportTicket>().AddRange(tickets(client.Id));
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Fixture(
            scope, scope.ServiceProvider.GetRequiredService<ITicketRepository>(), client.Id);
    }

    private static SupportTicket Ticket(
        Guid            clientId,
        string          subject     = "Sin internet",
        TicketStatus    status      = TicketStatus.Abierto,
        TicketPriority  priority    = TicketPriority.Media,
        TicketType      type        = TicketType.SoporteTecnico,
        DateTime?       dueDate     = null,
        int             diasDeVida  = 0,
        bool            asignado    = false) => new()
    {
        Id              = Guid.NewGuid(),
        ClientId        = clientId,
        Subject         = subject,
        Description     = "Descripción de prueba para el ticket.",
        Type            = type,
        Priority        = priority,
        Status          = status,
        Origin          = TicketOrigin.Manual,
        CreatedByUserId = UserId,
        AssignedToUserId = asignado ? UserId : null,
        CreatedAt       = DateTime.UtcNow.AddDays(-diasDeVida),
        DueDate         = dueDate,
    };

    // ── El filtro global del cliente ────────────────────────────────────────

    [Fact]
    public async Task ClienteDadoDeBaja_SusTicketsSiguenSaliendoConSuNombre()
    {
        var f = await SeedAsync(id => [Ticket(id)], clientDadoDeBaja: true);
        using var scope = f.Scope;

        var (items, total) = await f.Repo.GetPagedAsync(new TicketListFilter());

        Assert.Equal(1, total);
        Assert.Equal("Cliente Tickets", Assert.Single(items).Client!.FullName);
    }

    [Fact]
    public async Task FichaDeUnTicket_DeClienteDadoDeBaja_TraeClienteYPlan()
    {
        var f = await SeedAsync(id => [Ticket(id)], clientDadoDeBaja: true);
        using var scope = f.Scope;

        var (items, _) = await f.Repo.GetPagedAsync(new TicketListFilter());
        var ficha = await f.Repo.GetDetailAsync(items[0].Id);

        Assert.NotNull(ficha);
        Assert.Equal("Cliente Tickets", ficha!.Client!.FullName);
        Assert.Equal("Plan Plata",      ficha.Client.Plan!.Name);
    }

    // ── GetPagedAsync ───────────────────────────────────────────────────────

    [Fact]
    public async Task Listado_OrdenaAbiertosPrimeroYLuegoPorPrioridad()
    {
        var f = await SeedAsync(id =>
        [
            Ticket(id, "Cerrado viejo", TicketStatus.Cerrado,  TicketPriority.Critica, diasDeVida: 9),
            Ticket(id, "Abierto baja",  TicketStatus.Abierto,  TicketPriority.Baja,    diasDeVida: 8),
            Ticket(id, "Abierto crit",  TicketStatus.Abierto,  TicketPriority.Critica, diasDeVida: 7),
        ]);
        using var scope = f.Scope;

        var (items, _) = await f.Repo.GetPagedAsync(new TicketListFilter());

        Assert.Equal(["Abierto crit", "Abierto baja", "Cerrado viejo"],
                     items.Select(t => t.Subject));
    }

    [Fact]
    public async Task Listado_BuscaEnAsuntoDescripcionYDatosDelCliente()
    {
        var f = await SeedAsync(id =>
        [
            Ticket(id, "Sin internet"),
            Ticket(id, "Cambio de equipo"),
        ]);
        using var scope = f.Scope;

        var (porAsunto,  _) = await f.Repo.GetPagedAsync(new TicketListFilter(Search: "equipo"));
        var (porCliente, _) = await f.Repo.GetPagedAsync(new TicketListFilter(Search: "TBN-7001"));

        Assert.Equal("Cambio de equipo", Assert.Single(porAsunto).Subject);
        Assert.Equal(2, porCliente.Count);
    }

    [Fact]
    public async Task Listado_FiltraPorEstadoPrioridadTipoYTecnico()
    {
        var f = await SeedAsync(id =>
        [
            Ticket(id, "A", TicketStatus.EnProceso, TicketPriority.Alta,
                   TicketType.InstalacionNueva, asignado: true),
            Ticket(id, "B", TicketStatus.Abierto,   TicketPriority.Baja),
        ]);
        using var scope = f.Scope;

        var (porEstado,    _) = await f.Repo.GetPagedAsync(new TicketListFilter(Status: "EnProceso"));
        var (porPrioridad, _) = await f.Repo.GetPagedAsync(new TicketListFilter(Priority: "Alta"));
        var (porTipo,      _) = await f.Repo.GetPagedAsync(new TicketListFilter(Type: "InstalacionNueva"));
        var (porTecnico,   _) = await f.Repo.GetPagedAsync(new TicketListFilter(AssignedToId: UserId));

        Assert.Equal("A", Assert.Single(porEstado).Subject);
        Assert.Equal("A", Assert.Single(porPrioridad).Subject);
        Assert.Equal("A", Assert.Single(porTipo).Subject);
        Assert.Equal("A", Assert.Single(porTecnico).Subject);
    }

    [Fact]
    public async Task Listado_FiltroAll_NoAcotaNada()
    {
        var f = await SeedAsync(id => [Ticket(id, "A"), Ticket(id, "B", TicketStatus.Cerrado)]);
        using var scope = f.Scope;

        var (items, _) = await f.Repo.GetPagedAsync(
            new TicketListFilter(Status: "all", Priority: "all", Type: "all"));

        Assert.Equal(2, items.Count);
    }

    [Fact]
    public async Task Listado_PaginaYCuentaElTotalSinPaginar()
    {
        var f = await SeedAsync(id =>
            [Ticket(id, "A", diasDeVida: 3), Ticket(id, "B", diasDeVida: 2), Ticket(id, "C", diasDeVida: 1)]);
        using var scope = f.Scope;

        var (pagina, total) = await f.Repo.GetPagedAsync(
            new TicketListFilter(Page: 2, PageSize: 2));

        Assert.Equal(3, total);
        Assert.Equal("C", Assert.Single(pagina).Subject);
    }

    // ── SLA ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task SlaVencido_IgnoraLosYaResueltosCerradosOEnEsperaDelCliente()
    {
        var vencido = DateTime.UtcNow.AddHours(-2);
        var f = await SeedAsync(id =>
        [
            Ticket(id, "Vencido abierto",  TicketStatus.Abierto,          dueDate: vencido),
            Ticket(id, "Resuelto",         TicketStatus.Resuelto,         dueDate: vencido),
            Ticket(id, "Cerrado",          TicketStatus.Cerrado,          dueDate: vencido),
            Ticket(id, "Espera cliente",   TicketStatus.PendienteCliente, dueDate: vencido),
            Ticket(id, "Aun en plazo",     TicketStatus.Abierto,          dueDate: DateTime.UtcNow.AddHours(5)),
        ]);
        using var scope = f.Scope;

        var vencidos = await f.Repo.GetOverdueSlaAsync(DateTime.UtcNow);

        Assert.Equal("Vencido abierto", Assert.Single(vencidos).Subject);
    }

    [Fact]
    public async Task SlaVencido_AcotaPorFechaYPorNombreDeTecnico()
    {
        var vencido = DateTime.UtcNow.AddHours(-2);
        var f = await SeedAsync(id =>
        [
            Ticket(id, "Con tecnico", dueDate: vencido, diasDeVida: 1, asignado: true),
            Ticket(id, "Sin tecnico", dueDate: vencido, diasDeVida: 30),
        ]);
        using var scope = f.Scope;

        var porTecnico = await f.Repo.GetOverdueSlaAsync(
            DateTime.UtcNow, technicianName: "rojas");
        var recientes  = await f.Repo.GetOverdueSlaAsync(
            DateTime.UtcNow, from: DateTime.UtcNow.AddDays(-7));

        Assert.Equal("Con tecnico", Assert.Single(porTecnico).Subject);
        Assert.Equal("Con tecnico", Assert.Single(recientes).Subject);
    }

    [Fact]
    public async Task Semaforo_ProyectaNombresDeClienteYTecnicoYExcluyeSinPlazo()
    {
        var f = await SeedAsync(id =>
        [
            Ticket(id, "Con plazo", dueDate: DateTime.UtcNow.AddHours(3), asignado: true),
            Ticket(id, "Sin plazo"),
            Ticket(id, "Cerrado", TicketStatus.Cerrado, dueDate: DateTime.UtcNow.AddHours(3)),
        ]);
        using var scope = f.Scope;

        var seguidos = await f.Repo.GetSlaTrackedAsync();

        var item = Assert.Single(seguidos);
        Assert.Equal("Con plazo",       item.Subject);
        Assert.Equal("Cliente Tickets", item.ClientName);
        Assert.Equal("Tecnico Rojas",   item.AssignedToName);
    }

    [Fact]
    public async Task TicketsDelCliente_DelMasRecienteAlMasAntiguo()
    {
        var f = await SeedAsync(id =>
            [Ticket(id, "Viejo", diasDeVida: 10), Ticket(id, "Nuevo", diasDeVida: 1)]);
        using var scope = f.Scope;

        var items = await f.Repo.GetForClientAsync(f.ClientId);

        Assert.Equal(["Nuevo", "Viejo"], items.Select(t => t.Subject));
    }
}
