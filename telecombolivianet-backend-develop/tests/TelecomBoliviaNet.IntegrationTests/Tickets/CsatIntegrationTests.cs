using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.Tickets.Commands;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Tickets;

/// <summary>
/// D-26 — La calificación del cliente va a su columna, y no pisa el análisis
/// del técnico.
/// </summary>
/// <remarks>
/// El chatbot ya recogía la calificación y la mandaba como texto dentro de
/// <c>RootCause</c> ("CSAT: 4/5 — Buena"). Ese campo es el análisis de causa raíz
/// que escribe el técnico y el backend lo <b>sobrescribe entero</b>: cada
/// calificación lo borraba. Y el número quedaba en prosa, así que no había forma
/// de sacar un promedio.
///
/// <para>Las columnas para guardarlo bien llevaban en la base desde 2026-05 sin
/// que nadie las mapeara: figuraban como huérfanas en D-04.</para>
/// </remarks>
public class CsatIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public CsatIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private sealed record Caso(IServiceScope Scope, AppDbContext Db, Guid TicketId);

    private async Task<Caso> SeedAsync(string? rootCausePrevio = null)
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync("""
            DELETE FROM "TicketVisits";
            DELETE FROM "SupportTickets";
            DELETE FROM "Clients";
            DELETE FROM "Plans";
            DELETE FROM "UserSystems";
            """);

        var userId = Guid.NewGuid();
        var planId = Guid.NewGuid();
        db.Set<UserSystem>().Add(new UserSystem
        {
            Id = userId, FullName = "Tecnico CSAT", Email = $"csat-{userId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Tecnico, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = planId, Name = "Plan CSAT", SpeedMb = 50, MonthlyPrice = 100m, IsActive = true,
        });

        var cliente = Client.Create(
            tbnCode: "TBN-9001", fullName: "Cliente CSAT", identityCard: "CI-9001",
            phoneMain: "59171435981", zone: "Zona Norte",
            installationDate: DateTime.UtcNow.AddMonths(-3),
            installedByUserId: userId, planId: planId);
        db.Set<Client>().Add(cliente);

        var ticket = new SupportTicket
        {
            Id           = Guid.NewGuid(),
            TicketNumber = "TKT-9001",
            ClientId     = cliente.Id,
            Subject      = "Sin internet",
            Description  = "El cliente reporta corte total.",
            Status          = TicketStatus.Resuelto,
            CreatedByUserId = userId,
            RootCause    = rootCausePrevio,
            CreatedAt    = DateTime.UtcNow.AddDays(-2),
        };
        db.Set<SupportTicket>().Add(ticket);

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return new Caso(scope, db, ticket.Id);
    }

    private static IMediator Mediator(Caso c) => c.Scope.ServiceProvider.GetRequiredService<IMediator>();

    [Fact]
    public async Task LaCalificacion_SeGuardaComoNumero_YConSuFecha()
    {
        var caso = await SeedAsync();
        using var scope = caso.Scope;

        var r = await Mediator(caso).Send(new RecordCsatCommand(caso.TicketId, 4));
        r.IsSuccess.Should().BeTrue();
        caso.Db.ChangeTracker.Clear();

        var t = await caso.Db.Set<SupportTicket>().AsNoTracking().SingleAsync(x => x.Id == caso.TicketId);

        t.CsatScore.Should().Be(4, "un número se puede promediar; 'CSAT: 4/5 — Buena' no");
        t.CsatRespondedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task NoPisaElAnalisisDelTecnico()
    {
        // Éste es el fallo: RootCause se sobrescribe entero, así que la
        // calificación borraba lo que el técnico había diagnosticado.
        const string analisis = "Fibra cortada en el poste 14; se reempalmó.";
        var caso = await SeedAsync(rootCausePrevio: analisis);
        using var scope = caso.Scope;

        await Mediator(caso).Send(new RecordCsatCommand(caso.TicketId, 5));
        caso.Db.ChangeTracker.Clear();

        var t = await caso.Db.Set<SupportTicket>().AsNoTracking().SingleAsync(x => x.Id == caso.TicketId);

        t.RootCause.Should().Be(analisis, "calificar la atención no borra el diagnóstico técnico");
        t.CsatScore.Should().Be(5);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    [InlineData(-1)]
    public async Task UnaCalificacionFueraDeRango_SeRechaza(int score)
    {
        var caso = await SeedAsync();
        using var scope = caso.Scope;

        var r = await Mediator(caso).Send(new RecordCsatCommand(caso.TicketId, score));

        r.IsSuccess.Should().BeFalse();
        caso.Db.ChangeTracker.Clear();
        var t = await caso.Db.Set<SupportTicket>().AsNoTracking().SingleAsync(x => x.Id == caso.TicketId);
        t.CsatScore.Should().BeNull();
    }

    [Fact]
    public async Task RecalificarVale_YManda_LaUltima()
    {
        // Si alguien manda un segundo número, cuenta el último. Rechazarlo
        // obligaría al chatbot a explicar por qué no acepta una respuesta que la
        // persona acaba de dar.
        var caso = await SeedAsync();
        using var scope = caso.Scope;

        await Mediator(caso).Send(new RecordCsatCommand(caso.TicketId, 2));
        caso.Db.ChangeTracker.Clear();
        await Mediator(caso).Send(new RecordCsatCommand(caso.TicketId, 5));
        caso.Db.ChangeTracker.Clear();

        var t = await caso.Db.Set<SupportTicket>().AsNoTracking().SingleAsync(x => x.Id == caso.TicketId);
        t.CsatScore.Should().Be(5);
    }

    [Fact]
    public async Task UnTicketQueNoExiste_SeRechazaSinReventar()
    {
        var caso = await SeedAsync();
        using var scope = caso.Scope;

        var r = await Mediator(caso).Send(new RecordCsatCommand(Guid.NewGuid(), 4));

        r.IsSuccess.Should().BeFalse();
        r.ErrorMessage.Should().Contain("no encontrado", Exactly.Once());
    }
}
