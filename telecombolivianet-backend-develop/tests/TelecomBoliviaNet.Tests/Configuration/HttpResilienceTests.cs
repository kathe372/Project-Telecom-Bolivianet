using System.Net;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Presentation.Configuration;
using Xunit;

namespace TelecomBoliviaNet.Tests.Configuration;

/// <summary>
/// F8.2 — Que los reintentos existan, y que NO existan donde se decidió que no.
/// </summary>
/// <remarks>
/// La mitad de esta configuración es una decisión de negocio disfrazada de
/// ajuste técnico: repetir un POST que ya pudo ejecutarse puede mandarle a
/// alguien dos correos de recuperación de contraseña. Eso merece un test que se
/// ponga rojo si alguien "unifica los ajustes" por prolijidad.
/// </remarks>
public class HttpResilienceTests
{
    /// <summary>Cuenta intentos y va devolviendo las respuestas que se le indiquen.</summary>
    private sealed class HandlerDeGuion : HttpMessageHandler
    {
        private readonly Queue<Func<HttpResponseMessage>> _guion;
        public int Intentos { get; private set; }

        public HandlerDeGuion(params Func<HttpResponseMessage>[] guion)
            => _guion = new Queue<Func<HttpResponseMessage>>(guion);

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken ct)
        {
            Intentos++;
            var siguiente = _guion.Count > 0 ? _guion.Dequeue() : () => new HttpResponseMessage(HttpStatusCode.OK);
            return Task.FromResult(siguiente());
        }
    }

    private static (HttpClient Cliente, HandlerDeGuion Handler) Armar(
        bool soloSiElServidorRespondio, params Func<HttpResponseMessage>[] guion)
    {
        var handler  = new HandlerDeGuion(guion);
        var services = new ServiceCollection();

        services.AddHttpClient("prueba")
            .ConfigurePrimaryHttpMessageHandler(() => handler)
            .ConReintentos(intentosExtra: 2, segundosPorIntento: 5,
                           soloSiElServidorRespondio: soloSiElServidorRespondio,
                           // Sin esto el test esperaría los segundos del backoff real.
                           retardoBase: TimeSpan.FromMilliseconds(1));

        var cliente = services.BuildServiceProvider()
            .GetRequiredService<IHttpClientFactory>()
            .CreateClient("prueba");

        return (cliente, handler);
    }

    private static HttpResponseMessage Respuesta(HttpStatusCode code) => new(code);

    [Fact]
    public async Task UnFalloPasajeroDelServidor_SeReintenta_YTerminaBien()
    {
        var (cliente, handler) = Armar(soloSiElServidorRespondio: false,
            () => Respuesta(HttpStatusCode.ServiceUnavailable),
            () => Respuesta(HttpStatusCode.OK));

        var resp = await cliente.GetAsync("http://localhost/x");

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        handler.Intentos.Should().Be(2, "el 503 tenía que reintentarse una vez");
    }

    [Fact]
    public async Task UnCorteDeRed_SeReintenta_CuandoRepetirNoDuplicaNada()
    {
        // El caso de Nominatim y del aviso interno por WhatsApp.
        var (cliente, handler) = Armar(soloSiElServidorRespondio: false,
            () => throw new HttpRequestException("conexión rechazada"),
            () => Respuesta(HttpStatusCode.OK));

        var resp = await cliente.GetAsync("http://localhost/x");

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        handler.Intentos.Should().Be(2);
    }

    [Fact]
    public async Task UnCorteDeRed_NO_SeReintenta_CuandoRepetirDuplicariaUnCorreo()
    {
        // El caso de Resend. Desde aquí no se puede saber si el correo salió
        // antes de que se cayera la conexión, así que no se repite.
        var (cliente, handler) = Armar(soloSiElServidorRespondio: true,
            () => throw new HttpRequestException("conexión rechazada"),
            () => Respuesta(HttpStatusCode.OK));

        var acto = () => cliente.GetAsync("http://localhost/x");

        await acto.Should().ThrowAsync<HttpRequestException>();
        handler.Intentos.Should().Be(1,
            "repetir un envío que pudo haberse ejecutado le manda a alguien dos correos");
    }

    [Fact]
    public async Task UnRechazoExplicito_SI_SeReintenta_AunEnElModoConservador()
    {
        // Un 503 prueba que el servidor NO hizo nada con la petición: repetirla
        // es seguro incluso cuando el efecto no sería idempotente.
        var (cliente, handler) = Armar(soloSiElServidorRespondio: true,
            () => Respuesta(HttpStatusCode.ServiceUnavailable),
            () => Respuesta(HttpStatusCode.OK));

        var resp = await cliente.GetAsync("http://localhost/x");

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        handler.Intentos.Should().Be(2);
    }

    [Fact]
    public async Task UnErrorDelCliente_NoSeReintenta_NuncaVaACambiar()
    {
        var (cliente, handler) = Armar(soloSiElServidorRespondio: false,
            () => Respuesta(HttpStatusCode.BadRequest));

        var resp = await cliente.GetAsync("http://localhost/x");

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        handler.Intentos.Should().Be(1, "un 400 con el mismo cuerpo va a dar 400 las tres veces");
    }

    [Fact]
    public async Task LosIntentosTienenTecho()
    {
        var (cliente, handler) = Armar(soloSiElServidorRespondio: false,
            () => Respuesta(HttpStatusCode.ServiceUnavailable),
            () => Respuesta(HttpStatusCode.ServiceUnavailable),
            () => Respuesta(HttpStatusCode.ServiceUnavailable),
            () => Respuesta(HttpStatusCode.ServiceUnavailable));

        var resp = await cliente.GetAsync("http://localhost/x");

        resp.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        handler.Intentos.Should().Be(3, "un envío más dos reintentos, no una insistencia infinita");
    }
}
