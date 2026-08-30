using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Security;

/// <summary>
/// M-01 — La autorización que vive en el controlador, probada.
/// </summary>
/// <remarks>
/// <c>TicketsController</c> decide dos cosas que ningún handler puede decidir por
/// él, y hasta ahora no las probaba nadie:
///
/// <list type="number">
/// <item>Un técnico solo ve los tickets asignados A ÉL — el filtro se fuerza con
/// su propio id <b>sin importar qué haya mandado el cliente</b>, para que no pueda
/// espiar la carga de trabajo de un compañero cambiando el query string.</item>
/// <item>Un técnico solo puede ACTUAR sobre sus propios tickets
/// (<c>CanActOnTicketAsync</c>, que gobierna 9 endpoints).</item>
/// </list>
///
/// <para>Solo 2 archivos de test ejercitaban la API por HTTP, y ninguno cubría
/// esto. Son reglas de autorización a nivel de dato: si se rompen, un técnico ve
/// —y toca— trabajo que no es suyo, y ni el compilador ni los tests de dominio se
/// enteran.</para>
/// </remarks>
public class TechnicianScopeIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public TechnicianScopeIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private sealed record Escenario(
        IServiceScope Scope,
        UserSystem    TecnicoAna,
        UserSystem    TecnicoBeto,
        UserSystem    Admin,
        Guid          TicketDeAna,
        Guid          TicketDeBeto);

    private async Task<Escenario> SeedAsync()
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

        UserSystem Usuario(string nombre, UserRole rol) => new()
        {
            Id = Guid.NewGuid(), FullName = nombre,
            Email = $"{nombre.ToLower()}-{Guid.NewGuid():N}@test.bo",
            PasswordHash = "x", Role = rol, Status = UserStatus.Activo,
        };

        var ana   = Usuario("Ana",   UserRole.Tecnico);
        var beto  = Usuario("Beto",  UserRole.Tecnico);
        var admin = Usuario("Admin", UserRole.Admin);
        db.Set<UserSystem>().AddRange(ana, beto, admin);

        var planId = Guid.NewGuid();
        db.Set<Plan>().Add(new Plan
        {
            Id = planId, Name = "Plan Alcance", SpeedMb = 50, MonthlyPrice = 100m, IsActive = true,
        });

        var cliente = Client.Create(
            tbnCode: "TBN-7001", fullName: "Cliente Alcance", identityCard: "CI-7001",
            phoneMain: "59171700001", zone: "Zona Sur",
            installationDate: DateTime.UtcNow.AddMonths(-4),
            installedByUserId: admin.Id, planId: planId);
        db.Set<Client>().Add(cliente);

        SupportTicket Ticket(string num, UserSystem asignado) => new()
        {
            Id               = Guid.NewGuid(),
            TicketNumber     = num,
            ClientId         = cliente.Id,
            Subject          = $"Reclamo de {asignado.FullName}",
            Description      = "Sin servicio.",
            Status           = TicketStatus.EnProceso,
            AssignedToUserId = asignado.Id,
            CreatedByUserId  = admin.Id,
            CreatedAt        = DateTime.UtcNow.AddDays(-1),
        };

        var tAna  = Ticket("TKT-7001", ana);
        var tBeto = Ticket("TKT-7002", beto);
        db.Set<SupportTicket>().AddRange(tAna, tBeto);

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Escenario(scope, ana, beto, admin, tAna.Id, tBeto.Id);
    }

    private HttpClient ComoAsync(Escenario e, UserSystem usuario)
    {
        var jwt   = e.Scope.ServiceProvider.GetRequiredService<JwtTokenService>();
        var http  = _factory.CreateClient();
        http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", jwt.GenerateToken(usuario));
        return http;
    }

    private static async Task<List<string>> NumerosDeTicketAsync(HttpResponseMessage resp)
    {
        var json = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var data = json.RootElement.GetProperty("data");
        var items = data.ValueKind == JsonValueKind.Array ? data : data.GetProperty("Items");
        return items.EnumerateArray()
            .Select(x => x.GetProperty("TicketNumber").GetString() ?? "")
            .ToList();
    }

    // ── 1 · Lo que un técnico VE ────────────────────────────────────────────

    [Fact]
    public async Task UnTecnico_SoloVeSusPropiosTickets()
    {
        var e = await SeedAsync();
        using var scope = e.Scope;

        var resp = await ComoAsync(e, e.TecnicoAna).GetAsync("/api/tickets");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var numeros = await NumerosDeTicketAsync(resp);
        numeros.Should().Contain("TKT-7001");
        numeros.Should().NotContain("TKT-7002", "TKT-7002 está asignado a Beto");
    }

    [Fact]
    public async Task UnTecnico_NoPuedeVerLosDeOtro_AunqueLoPidaEnElQueryString()
    {
        // El caso que da sentido a la regla: el filtro se fuerza con el id del
        // técnico autenticado, IGNORANDO lo que venga por parámetro. Si algún día
        // se respetara el parámetro, Ana vería la carga de trabajo de Beto.
        var e = await SeedAsync();
        using var scope = e.Scope;

        var resp = await ComoAsync(e, e.TecnicoAna)
            .GetAsync($"/api/tickets?assignedToId={e.TecnicoBeto.Id}");

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var numeros = await NumerosDeTicketAsync(resp);

        numeros.Should().NotContain("TKT-7002",
            "pedir explícitamente los tickets de otro técnico no puede funcionar");
    }

    [Fact]
    public async Task UnAdministrador_LosVeTodos()
    {
        var e = await SeedAsync();
        using var scope = e.Scope;

        var numeros = await NumerosDeTicketAsync(
            await ComoAsync(e, e.Admin).GetAsync("/api/tickets"));

        numeros.Should().Contain(["TKT-7001", "TKT-7002"]);
    }

    // ── 2 · Sobre qué puede ACTUAR ──────────────────────────────────────────

    [Fact]
    public async Task UnTecnico_PuedeActuarSobreSuPropioTicket()
    {
        var e = await SeedAsync();
        using var scope = e.Scope;

        var resp = await ComoAsync(e, e.TecnicoAna).PutAsJsonAsync(
            $"/api/tickets/{e.TicketDeAna}",
            new { Description = "Revisado en sitio.", RootCause = "Conector flojo." });

        resp.StatusCode.Should().NotBe(HttpStatusCode.NotFound,
            "es su ticket: tiene que poder actualizarlo");
        resp.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task UnTecnico_NO_PuedeActuarSobreElTicketDeOtro()
    {
        // CanActOnTicketAsync gobierna 9 endpoints. Se responde 404 y no 403 a
        // propósito: confirmar que el ticket existe ya sería filtrar información
        // sobre el trabajo de otro.
        var e = await SeedAsync();
        using var scope = e.Scope;

        var resp = await ComoAsync(e, e.TecnicoAna).PutAsJsonAsync(
            $"/api/tickets/{e.TicketDeBeto}",
            new { Description = "No debería poder.", RootCause = (string?)null });

        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task UnAdministrador_PuedeActuarSobreElTicketDeCualquiera()
    {
        var e = await SeedAsync();
        using var scope = e.Scope;

        var resp = await ComoAsync(e, e.Admin).PutAsJsonAsync(
            $"/api/tickets/{e.TicketDeBeto}",
            new { Description = "Reasignado por el administrador.", RootCause = (string?)null });

        resp.StatusCode.Should().NotBe(HttpStatusCode.NotFound);
        resp.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task ElChatbot_ActuaSobreCualquierTicket_PorSuROL()
    {
        // S-01 — Esto lo decidía una comparación de correo contra una variable de
        // entorno. Ahora lo decide el rol, y este test lo fija: si alguien
        // devolviera la comparación por correo y la variable no estuviera puesta,
        // el chatbot perdería el acceso en silencio y esto se pondría rojo.
        var e = await SeedAsync();
        using var scope = e.Scope;

        var bot = new UserSystem
        {
            Id = Guid.NewGuid(), FullName = "Chatbot WhatsApp",
            Email = "otro-correo-distinto@test.bo",   // ← a propósito: no coincide
            PasswordHash = "x", Role = UserRole.Bot, Status = UserStatus.Activo,
        };

        var resp = await ComoAsync(e, bot).PutAsJsonAsync(
            $"/api/tickets/{e.TicketDeBeto}",
            new { Description = "Actualizado desde WhatsApp.", RootCause = (string?)null });

        resp.StatusCode.Should().NotBe(HttpStatusCode.NotFound,
            "el bot actúa en nombre de clientes sobre cualquier ticket");
    }
}
