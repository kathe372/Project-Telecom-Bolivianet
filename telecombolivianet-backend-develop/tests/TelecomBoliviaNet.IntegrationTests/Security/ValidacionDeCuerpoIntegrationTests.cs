using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Security;

/// <summary>
/// E-03 — La validación del cuerpo dejó de estar copiada en cada endpoint.
/// </summary>
/// <remarks>
/// El mismo bloque estaba 17 veces en los controladores y <c>TicketsController</c>
/// dedicaba 8 de sus 12 dependencias a ello. Ahora lo hace un filtro.
///
/// <para>Estos tests van por HTTP porque un filtro de acción es precisamente lo
/// que no se ve llamando al handler: si dejara de estar registrado, todos los
/// tests de dominio seguirían verdes y la API aceptaría cualquier cosa.</para>
///
/// <para>Comprueban además el <b>sobre</b>. Había dos: <c>{ success, message }</c>
/// y <c>{ success, errors: [...] }</c>, y el frontend lee solo <c>message</c>
/// (<c>extractApiError</c>), así que en siete endpoints el usuario veía el texto
/// genérico de reserva en lugar del motivo real del rechazo.</para>
/// </remarks>
public class ValidacionDeCuerpoIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public ValidacionDeCuerpoIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private async Task<HttpClient> ComoAdminAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.ExecuteSqlRawAsync("""DELETE FROM "UserSystems";""");

        var admin = new UserSystem
        {
            Id = Guid.NewGuid(), FullName = "Admin Validación",
            Email = $"val-{Guid.NewGuid():N}@test.bo",
            PasswordHash = "x", Role = UserRole.Admin, Status = UserStatus.Activo,
        };
        db.Set<UserSystem>().Add(admin);
        await db.SaveChangesAsync();

        var jwt  = scope.ServiceProvider.GetRequiredService<JwtTokenService>();
        var http = _factory.CreateClient();
        http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", jwt.GenerateToken(admin));
        return http;
    }

    private static async Task<(bool Exito, string Mensaje)> SobreAsync(HttpResponseMessage r)
    {
        var raiz = JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;
        return (raiz.GetProperty("success").GetBoolean(),
                raiz.TryGetProperty("message", out var m) ? m.GetString() ?? "" : "");
    }

    [Fact]
    public async Task UnCuerpoInvalido_SeRechaza_SinLlegarAlHandler()
    {
        // Un plan sin nombre y con precio negativo. Si el filtro no estuviera
        // registrado, esto llegaría al handler y se guardaría.
        var http = await ComoAdminAsync();

        var r = await http.PostAsJsonAsync("/api/plans",
            new { Name = "", SpeedMb = 0, MonthlyPrice = -50 });

        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // Y que el 400 salga del FILTRO, no de otro sitio: sin él, [ApiController]
        // devuelve 400 igualmente por las anotaciones del DTO, pero con
        // ProblemDetails — que no lleva `success` y el frontend no sabe leer.
        var cuerpo = await r.Content.ReadAsStringAsync();
        cuerpo.Should().Contain("success",
            "el sobre tiene que ser el del proyecto, no el ProblemDetails de ASP.NET");
    }

    [Fact]
    public async Task ElMensajeDeErrorLLEGA_EnElCampoQueElFrontendLee()
    {
        // Este endpoint devolvía { success, errors: [...] } y el frontend lee solo
        // `message`: el usuario veía el texto genérico de reserva en vez del motivo.
        var http = await ComoAdminAsync();

        var r = await http.PostAsJsonAsync("/api/plans",
            new { Name = "", SpeedMb = 0, MonthlyPrice = -50 });

        var (exito, mensaje) = await SobreAsync(r);

        exito.Should().BeFalse();
        mensaje.Should().NotBeNullOrWhiteSpace(
            "sin esto el usuario solo ve 'no se pudo guardar' y no sabe qué corregir");
    }

    [Fact]
    public async Task UnCuerpoValido_PasaDeLargo()
    {
        // Contraprueba: el filtro no puede estar rechazando lo que está bien.
        var http = await ComoAdminAsync();

        var r = await http.PostAsJsonAsync("/api/plans",
            new { Name = "Plan Filtro", SpeedMb = 100, MonthlyPrice = 250m });

        r.StatusCode.Should().NotBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task LosArgumentosSinValidadorRegistrado_NoEstorban()
    {
        // El filtro recorre TODOS los argumentos de la acción. Los ids de ruta y
        // los filtros de consulta no tienen validador y tienen que pasar de largo,
        // no romper la petición.
        var http = await ComoAdminAsync();

        var r = await http.GetAsync("/api/plans?onlyActive=true");

        r.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
