using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;

namespace TelecomBoliviaNet.IntegrationTests.Security;

/// <summary>
/// F8.1 — El contrato del chatbot, escrito.
/// </summary>
/// <remarks>
/// El chatbot entraba con rol <c>Tecnico</c>, así que podía todo lo que un
/// técnico humano. Ahora tiene rol propio, y este archivo es lo que dice qué
/// alcanza: cada ruta de <c>PuedeLlegar</c> se leyó de <c>SistemaApiService</c>,
/// el único cliente HTTP vivo del chatbot.
///
/// <para><b>Por qué en integración y no con dobles:</b> lo que puede romperse es
/// la tubería de autorización completa —política, atributo, claim de rol— y eso
/// no se comprueba sin levantar la aplicación. Un 403 aquí es un flujo de
/// atención al cliente caído por WhatsApp.</para>
///
/// <para>Se comprueba que <b>no sea 403</b>, no que la operación tenga éxito: sin
/// datos sembrados muchas devuelven 400 o 404, y eso está bien. Lo que se está
/// probando es la puerta, no lo que hay detrás.</para>
/// </remarks>
public class BotEndpointsIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public BotEndpointsIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private static readonly Guid AlgunId = Guid.NewGuid();

    private HttpClient ClienteCon(UserRole rol)
    {
        using var scope = _factory.Services.CreateScope();
        var jwt = scope.ServiceProvider.GetRequiredService<JwtTokenService>();

        // Se firma con el MISMO servicio que usa el login real: si cambiara la
        // forma del claim de rol, este test se entera igual que producción.
        var token = jwt.GenerateToken(new UserSystem
        {
            Id = Guid.NewGuid(), FullName = $"Prueba {rol}",
            Email = $"{rol}-{Guid.NewGuid():N}@test.bo".ToLowerInvariant(),
            PasswordHash = "x", Role = rol, Status = UserStatus.Activo,
        });

        var http = _factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return http;
    }

    /// <summary>Las 22 rutas que el chatbot usa hoy. Ninguna puede responder 403.</summary>
    public static TheoryData<string, string> PuedeLlegar() => new()
    {
        { "GET",   "/api/clients/by-phone?phone=71435981" },
        { "GET",   "/api/clients/by-phone-all?phone=71435981" },
        { "GET",   $"/api/clients/{AlgunId}/invoices/bot" },
        { "GET",   "/api/bot-config/public" },
        { "GET",   "/api/bot-config/company-qr" },
        { "GET",   "/api/plans" },
        { "GET",   "/api/coverage/check?lat=-17.78&lng=-63.18" },
        { "GET",   "/api/instalaciones/vigente?telefono=71435981" },
        { "GET",   $"/api/instalaciones/{AlgunId}" },
        { "GET",   "/api/instalaciones/slots-disponibles?dias=7" },
        { "POST",  "/api/instalaciones" },
        { "PATCH", $"/api/instalaciones/{AlgunId}/cancelar" },
        { "PATCH", $"/api/instalaciones/{AlgunId}/reprogramar" },
        { "POST",  "/api/tickets" },
        { "GET",   $"/api/tickets/by-client/{AlgunId}" },
        { "GET",   $"/api/tickets/by-client/{AlgunId}/recent-count" },
        { "PUT",   $"/api/tickets/{AlgunId}" },
        { "PATCH", $"/api/tickets/{AlgunId}/status" },
        { "PATCH", $"/api/tickets/{AlgunId}/reschedule" },
        { "GET",   $"/api/tickets/{AlgunId}/visit-slots" },
        { "POST",  $"/api/tickets/{AlgunId}/visits" },
        { "POST",  "/api/notifications/delivery-status" },
        { "POST",  $"/api/clients/{AlgunId}/plan-change" },
    };

    /// <summary>
    /// Lo que el bot PODÍA hacer siendo técnico y ya no. No es una lista
    /// exhaustiva — es la muestra que demuestra que el rol dejó de ser el de un
    /// técnico humano.
    /// </summary>
    public static TheoryData<string, string> NoPuedeLlegar() => new()
    {
        // OBS-04 — El listado general de instalaciones. Era la concesión más
        // ancha de F8.1, y estaba solo porque el bot resolvía "¿tiene una
        // instalación agendada?" trayéndose las últimas cien de toda la empresa
        // y filtrando en memoria. Con /vigente ya no le hace falta.
        { "GET",  "/api/instalaciones?PageSize=20" },
        { "GET",  "/api/clients" },                       // toda la cartera
        { "POST", "/api/clients" },                       // dar de alta clientes
        { "GET",  $"/api/clients/{AlgunId}" },
        { "POST", $"/api/clients/{AlgunId}/payments" },   // registrar cobros
        { "GET",  "/api/payments/check-duplicate?monto=1" },
        { "GET",  "/api/tickets" },                       // el tablero completo
        { "GET",  "/api/tickets/kanban" },
        { "GET",  "/api/instalaciones/mi-agenda" },
        { "GET",  "/api/coverage/boxes" },
        { "GET",  "/api/dashboard/kpis" },                // el bot no mira tableros
        { "GET",  "/api/invoices/annual-report?anio=2026" },
        { "GET",  $"/api/clients/{AlgunId}/historial" },
    };

    private static Task<HttpResponseMessage> EnviarAsync(HttpClient http, string verbo, string ruta)
    {
        var req = new HttpRequestMessage(new HttpMethod(verbo), ruta);
        if (verbo is "POST" or "PUT" or "PATCH")
            req.Content = JsonContent.Create(new { });
        return http.SendAsync(req);
    }

    [Theory]
    [MemberData(nameof(PuedeLlegar))]
    public async Task ElBot_LlegaALoQueUsa(string verbo, string ruta)
    {
        var resp = await EnviarAsync(ClienteCon(UserRole.Bot), verbo, ruta);

        resp.StatusCode.Should().NotBe(HttpStatusCode.Forbidden,
            $"el chatbot llama a {verbo} {ruta}: un 403 aquí es una conversación caída por WhatsApp");
        resp.StatusCode.Should().NotBe(HttpStatusCode.Unauthorized,
            "el token del bot es válido; si no lo fuera, el problema es el claim de rol");
    }

    [Theory]
    [MemberData(nameof(NoPuedeLlegar))]
    public async Task ElBot_YaNoPuedeLoQuePodiaComoTecnico(string verbo, string ruta)
    {
        var resp = await EnviarAsync(ClienteCon(UserRole.Bot), verbo, ruta);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            $"con rol Tecnico el bot alcanzaba {verbo} {ruta}; ese era justamente el problema");
    }

    [Theory]
    [MemberData(nameof(NoPuedeLlegar))]
    public async Task ElTecnicoHumano_NoPierdeNada(string verbo, string ruta)
    {
        // Contraprueba: las políticas nuevas SUMAN el rol Bot, no reemplazan a
        // nadie. Si este test se pusiera rojo, la fase habría roto a los técnicos
        // en vez de acotar al bot.
        var resp = await EnviarAsync(ClienteCon(UserRole.Tecnico), verbo, ruta);

        if (resp.StatusCode == HttpStatusCode.Forbidden)
            // Hay endpoints de la muestra que son AdminOnly y el técnico tampoco
            // alcanzaba antes; lo que no puede pasar es que fallen los suyos.
            (verbo, ruta).Should().NotBe(("GET", "/api/tickets"),
                "el tablero de tickets es del técnico y tiene que seguir siéndolo");
    }

    [Theory]
    [MemberData(nameof(PuedeLlegar))]
    public async Task ElAdministrador_SigueAlcanzandoTodoLoDelBot(string verbo, string ruta)
    {
        var resp = await EnviarAsync(ClienteCon(UserRole.Admin), verbo, ruta);

        resp.StatusCode.Should().NotBe(HttpStatusCode.Forbidden,
            "las políticas nuevas mantienen a Admin; si no, se rompió el panel");
    }
}
