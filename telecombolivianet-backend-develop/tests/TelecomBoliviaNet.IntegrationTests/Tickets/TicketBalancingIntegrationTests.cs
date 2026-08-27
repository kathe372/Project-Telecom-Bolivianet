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
/// F4 — El reparto de carga entre técnicos dejó de traerse los tickets abiertos
/// a memoria para agruparlos: ahora <see cref="ITicketRepository"/> devuelve el
/// conteo ya hecho.
///
/// <para>Esas dos consultas son <c>GroupBy</c> con <c>Count</c> condicional y
/// <c>Max</c>, sobre un enum que se persiste como texto. Un test con LINQ a
/// objetos las daría por buenas aunque EF no supiera traducirlas — que es
/// justamente lo que hay que comprobar aquí.</para>
/// </summary>
public class TicketBalancingIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public TicketBalancingIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private static readonly Guid PlanId   = Guid.NewGuid();
    private static readonly Guid TecnicoA = Guid.NewGuid();
    private static readonly Guid TecnicoB = Guid.NewGuid();

    private sealed record Fixture(
        IServiceScope Scope, ITicketRepository Tickets, IUserRepository Users);

    private async Task<Fixture> SeedAsync(params SupportTicket[] tickets)
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

        db.Set<UserSystem>().AddRange(
            Tecnico(TecnicoA, "Ana Rojas"),
            Tecnico(TecnicoB, "Bruno Vega"),
            new UserSystem
            {
                Id = Guid.NewGuid(), FullName = "Admin Central",
                Email = $"admin-{Guid.NewGuid():N}@test.bo", PasswordHash = "x",
                Role = UserRole.Admin, Status = UserStatus.Activo,
            },
            new UserSystem
            {
                Id = Guid.NewGuid(), FullName = "Tecnico Inactivo",
                Email = $"inact-{Guid.NewGuid():N}@test.bo", PasswordHash = "x",
                Role = UserRole.Tecnico, Status = UserStatus.Inactivo,
            });

        db.Set<Plan>().Add(new Plan
        {
            Id = PlanId, Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149m, IsActive = true,
        });

        var client = Client.Create(
            tbnCode: "TBN-6001", fullName: "Cliente Balanceo", identityCard: "6001001",
            phoneMain: "59171000600", zone: "Zona Norte",
            installationDate: DateTime.UtcNow.AddMonths(-6),
            installedByUserId: TecnicoA, planId: PlanId);
        client.WinboxNumber = "WB-6001";
        db.Set<Client>().Add(client);

        foreach (var t in tickets) t.ClientId = client.Id;
        db.Set<SupportTicket>().AddRange(tickets);

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Fixture(
            scope,
            scope.ServiceProvider.GetRequiredService<ITicketRepository>(),
            scope.ServiceProvider.GetRequiredService<IUserRepository>());
    }

    private static UserSystem Tecnico(Guid id, string nombre) => new()
    {
        Id = id, FullName = nombre, Email = $"tec-{id:N}@test.bo",
        PasswordHash = "x", Role = UserRole.Tecnico, Status = UserStatus.Activo,
    };

    private static SupportTicket Ticket(
        Guid           asignadoA,
        TicketStatus   status     = TicketStatus.Abierto,
        TicketPriority priority   = TicketPriority.Media,
        int            diasDeVida = 0) => new()
    {
        Id               = Guid.NewGuid(),
        Subject          = "Ticket de carga",
        Description      = "Descripción de prueba.",
        Type             = TicketType.SoporteTecnico,
        Priority         = priority,
        Status           = status,
        Origin           = TicketOrigin.Manual,
        CreatedByUserId  = TecnicoA,
        AssignedToUserId = asignadoA,
        CreatedAt        = DateTime.UtcNow.AddDays(-diasDeVida),
    };

    [Fact]
    public async Task TecnicosActivos_ExcluyeInactivosYOtrosRoles()
    {
        var f = await SeedAsync();
        using var scope = f.Scope;

        var tecnicos = await f.Users.GetActiveTechniciansAsync();

        Assert.Equal(["Ana Rojas", "Bruno Vega"], tecnicos.Select(t => t.FullName));
    }

    [Fact]
    public async Task Carga_CuentaSoloLosTicketsVivosYSeparaLosCriticos()
    {
        var f = await SeedAsync(
            Ticket(TecnicoA, TicketStatus.Abierto,          TicketPriority.Critica),
            Ticket(TecnicoA, TicketStatus.EnProceso,        TicketPriority.Media),
            Ticket(TecnicoA, TicketStatus.PendienteCliente, TicketPriority.Baja),
            Ticket(TecnicoA, TicketStatus.Resuelto,         TicketPriority.Critica),
            Ticket(TecnicoA, TicketStatus.Cerrado,          TicketPriority.Alta),
            Ticket(TecnicoB, TicketStatus.Abierto,          TicketPriority.Alta));
        using var scope = f.Scope;

        var carga = await f.Tickets.GetOpenLoadByTechnicianAsync([TecnicoA, TecnicoB]);

        Assert.Equal(new TechnicianLoad(3, 1), carga[TecnicoA]);
        Assert.Equal(new TechnicianLoad(1, 0), carga[TecnicoB]);
    }

    [Fact]
    public async Task Carga_QuienNoTieneNingunoNoAparece()
    {
        var f = await SeedAsync(Ticket(TecnicoA));
        using var scope = f.Scope;

        var carga = await f.Tickets.GetOpenLoadByTechnicianAsync([TecnicoA, TecnicoB]);

        Assert.True(carga.ContainsKey(TecnicoA));
        Assert.False(carga.ContainsKey(TecnicoB));
    }

    [Fact]
    public async Task Carga_SinTecnicos_NoConsultaYDevuelveVacio()
    {
        var f = await SeedAsync(Ticket(TecnicoA));
        using var scope = f.Scope;

        Assert.Empty(await f.Tickets.GetOpenLoadByTechnicianAsync([]));
        Assert.Empty(await f.Tickets.GetLastAssignmentByTechnicianAsync([]));
    }

    [Fact]
    public async Task UltimaAsignacion_DevuelveLaMasRecienteDeCadaTecnico()
    {
        var f = await SeedAsync(
            Ticket(TecnicoA, diasDeVida: 10),
            Ticket(TecnicoA, diasDeVida: 2),
            Ticket(TecnicoB, diasDeVida: 30));
        using var scope = f.Scope;

        var ultimas = await f.Tickets.GetLastAssignmentByTechnicianAsync([TecnicoA, TecnicoB]);

        // El de hace 2 días gana sobre el de hace 10; y A es más reciente que B.
        Assert.True(ultimas[TecnicoA] > ultimas[TecnicoB]);
        Assert.True(ultimas[TecnicoA] > DateTime.UtcNow.AddDays(-3));
    }

    [Fact]
    public async Task UltimaAsignacion_CuentaTambienLosTicketsYaCerrados()
    {
        // Es lo correcto: para rotar el reparto importa cuándo se le dio trabajo
        // por última vez, no si ese trabajo sigue abierto.
        var f = await SeedAsync(Ticket(TecnicoA, TicketStatus.Cerrado, diasDeVida: 1));
        using var scope = f.Scope;

        var ultimas = await f.Tickets.GetLastAssignmentByTechnicianAsync([TecnicoA]);

        Assert.True(ultimas.ContainsKey(TecnicoA));
    }
}
