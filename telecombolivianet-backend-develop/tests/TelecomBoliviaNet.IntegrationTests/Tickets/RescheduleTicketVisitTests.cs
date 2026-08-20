using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Tickets.Commands;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Tickets;

/// <summary>
/// Reprogramación de visita técnica de un ticket (Plan B) end-to-end contra
/// PostgreSQL real vía MediatR. Verifica la persistencia completa: visita
/// reprogramada in-place (sin duplicar), estado del ticket → EnVisita, comentario
/// de auditoría, conversión de hora local Bolivia→UTC y fila de notificación al
/// cliente. Requiere Docker (Testcontainers) para levantar el contenedor PostGIS.
/// </summary>
public class RescheduleTicketVisitTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public RescheduleTicketVisitTests(CustomWebApplicationFactory factory) => _factory = factory;

    /// <summary>
    /// Usuario del sistema al que apuntan las FK de Client.InstalledByUserId,
    /// SupportTicket.CreatedByUserId y TicketVisit.CreatedByUserId.
    ///
    /// Auditoría 2026-08-06: la semilla usaba <c>Guid.NewGuid()</c> para esos tres campos, es
    /// decir un usuario inexistente — la inserción violaba
    /// <c>FK_Clients_UserSystems_InstalledByUserId</c> y las TRES pruebas de esta clase fallaban
    /// siempre. Nadie lo notó porque la suite de integración no se ejecutaba en CI (mismo origen
    /// que el proyecto UnitTests, que llevaba meses sin compilar).
    /// </summary>
    private static readonly Guid ActorId = Guid.NewGuid();

    private async Task<IServiceScope> SeedAsync(Func<AppDbContext, Task> seed)
    {
        var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            "DELETE FROM \"TicketNotifications\"; DELETE FROM \"TicketComments\"; " +
            "DELETE FROM \"TicketVisits\"; DELETE FROM \"SupportTickets\"; " +
            "DELETE FROM \"Clients\"; DELETE FROM \"Plans\"; DELETE FROM \"UserSystems\";");

        db.Set<UserSystem>().Add(new UserSystem
        {
            Id           = ActorId,
            FullName     = "Operador IT",
            Email        = $"it-{ActorId:N}@test.bo",
            PasswordHash = "x",
            Role         = UserRole.Operador,
            Status       = UserStatus.Activo,
        });

        await seed(db);
        await db.SaveChangesAsync();
        return scope;
    }

    private static Plan NewPlan() => new() { Name = "IT Plan", SpeedMb = 100, MonthlyPrice = 200m };

    private static Client NewClient(Guid planId) => Client.Create(
        tbnCode: "TBN-IT-" + Guid.NewGuid().ToString()[..6],
        fullName: "Cliente IT", identityCard: "12345678",
        phoneMain: "59171234567", zone: "Sur",
        installationDate: DateTime.UtcNow.AddMonths(-2),
        installedByUserId: ActorId, planId: planId);

    private static SupportTicket NewTicket(Guid clientId, TicketStatus status) => new()
    {
        ClientId        = clientId,
        Subject         = "Sin conexión",
        Type            = TicketType.SoporteTecnico,
        Priority        = TicketPriority.Alta,
        Status          = status,
        Origin          = TicketOrigin.Bot,
        Description     = "IT",
        TicketNumber    = "TK-IT-0001",
        CreatedByUserId = ActorId,
        CreatedAt       = DateTime.UtcNow,
    };

    private static RescheduleTicketVisitCommand Cmd(Guid ticketId, string fecha, string hora) =>
        new(ticketId, new RescheduleTicketVisitDto { Fecha = fecha, Hora = hora },
            ActorId, "Bot Chatbot", "127.0.0.1");

    private static string FutureDate() => DateTime.UtcNow.AddDays(10).ToString("yyyy-MM-dd");

    [Fact]
    public async Task Reschedule_ExistingVisit_UpdatesInPlace_NoDuplicate_AndNotifies()
    {
        Guid ticketId = Guid.Empty, visitId = Guid.Empty;
        using var scope = await SeedAsync(db =>
        {
            var plan = NewPlan(); db.Set<Plan>().Add(plan);
            var client = NewClient(plan.Id); db.Set<Client>().Add(client);
            var ticket = NewTicket(client.Id, TicketStatus.EnProceso);
            ticketId = ticket.Id;
            db.Set<SupportTicket>().Add(ticket);
            var visit = new TicketVisit
            {
                TicketId = ticket.Id, ScheduledAt = DateTime.UtcNow.AddDays(2),
                Status = VisitStatus.Programada, CreatedByUserId = ActorId,
            };
            visitId = visit.Id;
            db.Set<TicketVisit>().Add(visit);
            return Task.CompletedTask;
        });

        var result = await scope.ServiceProvider.GetRequiredService<IMediator>()
            .Send(Cmd(ticketId, "2026-12-01", "15:00"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        using var verify = _factory.Services.CreateScope();
        var db = verify.ServiceProvider.GetRequiredService<AppDbContext>();

        // In-place: sigue habiendo exactamente 1 visita para el ticket.
        var visits = await db.Set<TicketVisit>().Where(v => v.TicketId == ticketId).ToListAsync();
        visits.Should().ContainSingle();
        visits[0].Id.Should().Be(visitId);
        // 15:00 Bolivia (UTC-4) == 19:00 UTC.
        visits[0].ScheduledAt.Should().Be(new DateTime(2026, 12, 1, 19, 0, 0, DateTimeKind.Utc));

        // Ticket → EnVisita.
        (await db.Set<SupportTicket>().FindAsync(ticketId))!.Status.Should().Be(TicketStatus.EnVisita);

        // Comentario de auditoría y fila de notificación al cliente.
        (await db.Set<TicketComment>().CountAsync(c => c.TicketId == ticketId)).Should().Be(1);
        (await db.Set<TicketNotification>()
            .CountAsync(n => n.TicketId == ticketId && n.Type == NotificationType.VisitaProgramada))
            .Should().Be(1);
    }

    [Fact]
    public async Task Reschedule_NoExistingVisit_CreatesOne()
    {
        Guid ticketId = Guid.Empty;
        using var scope = await SeedAsync(db =>
        {
            var plan = NewPlan(); db.Set<Plan>().Add(plan);
            var client = NewClient(plan.Id); db.Set<Client>().Add(client);
            var ticket = NewTicket(client.Id, TicketStatus.Abierto);
            ticketId = ticket.Id;
            db.Set<SupportTicket>().Add(ticket);
            return Task.CompletedTask;
        });

        var result = await scope.ServiceProvider.GetRequiredService<IMediator>()
            .Send(Cmd(ticketId, FutureDate(), "10:30"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        using var verify = _factory.Services.CreateScope();
        var db = verify.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Set<TicketVisit>().CountAsync(v => v.TicketId == ticketId)).Should().Be(1);
        (await db.Set<SupportTicket>().FindAsync(ticketId))!.Status.Should().Be(TicketStatus.EnVisita);
    }

    [Fact]
    public async Task Reschedule_ClosedTicket_Fails_NoVisitCreated()
    {
        Guid ticketId = Guid.Empty;
        using var scope = await SeedAsync(db =>
        {
            var plan = NewPlan(); db.Set<Plan>().Add(plan);
            var client = NewClient(plan.Id); db.Set<Client>().Add(client);
            var ticket = NewTicket(client.Id, TicketStatus.Cerrado);
            ticketId = ticket.Id;
            db.Set<SupportTicket>().Add(ticket);
            return Task.CompletedTask;
        });

        var result = await scope.ServiceProvider.GetRequiredService<IMediator>()
            .Send(Cmd(ticketId, FutureDate(), "12:00"), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();

        using var verify = _factory.Services.CreateScope();
        var db = verify.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Set<TicketVisit>().CountAsync(v => v.TicketId == ticketId)).Should().Be(0);
    }
}
