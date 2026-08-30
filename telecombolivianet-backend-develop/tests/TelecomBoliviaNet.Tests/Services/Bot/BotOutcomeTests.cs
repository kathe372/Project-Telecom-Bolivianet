using System.Net;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Moq.Protected;
using TelecomBoliviaNet.Application.Services.Bot;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services.Bot;

/// <summary>
/// OBS-02 — "El bot dijo que no" y "el bot no responde" eran el mismo <c>false</c>.
/// </summary>
/// <remarks>
/// La diferencia le importa a quien está delante de la pantalla: si el chatbot
/// rechazó la operación —la conversación ya la tiene otro agente— insistir no
/// sirve; si no respondió, en un minuto probablemente sí. Con un solo
/// <c>false</c>, el operador no podía saber cuál de las dos le había pasado.
/// </remarks>
public class BotOutcomeTests
{
    /// <summary>Un proxy mínimo para ejercitar la política de la clase base.</summary>
    private sealed class ProxyDePrueba : BotProxyBase
    {
        public ProxyDePrueba(IHttpClientFactory f)
            : base(f, new ConfigurationBuilder().Build(), NullLogger.Instance) { }

        public Task<BotResult> HacerAlgoAsync(string url)
            => IntentarAsync(
                async () => (await _http.SendAsync(new HttpRequestMessage(HttpMethod.Post, url)))
                            .IsSuccessStatusCode,
                "prueba: fallo llamando a {Url}", url);

        public Task<int> LeerAlgoAsync(string url)
            => SinRomperElPanelAsync(
                -1,
                async () => { await _http.SendAsync(new HttpRequestMessage(HttpMethod.Get, url)); return 7; },
                "prueba: fallo leyendo {Url}", url);
    }

    private static ProxyDePrueba ProxyQue(Func<HttpResponseMessage> respuesta)
    {
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>("SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(), ItExpr.IsAny<CancellationToken>())
            .Returns(() => Task.FromResult(respuesta()));

        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>()))
            .Returns(new HttpClient(handler.Object) { BaseAddress = new Uri("http://bot.local/") });

        return new ProxyDePrueba(factory.Object);
    }

    [Fact]
    public async Task ElBotAcepta_EsHecho()
        => (await ProxyQue(() => new HttpResponseMessage(HttpStatusCode.OK)).HacerAlgoAsync("x"))
            .Outcome.Should().Be(BotOutcome.Hecho);

    [Fact]
    public async Task ElBotContestaQueNo_EsRechazado_NoUnaCaida()
    {
        // 409: la conversación ya la tiene otro agente. El bot está perfectamente
        // vivo y ha dicho que no. Insistir no cambia nada.
        var r = await ProxyQue(() => new HttpResponseMessage(HttpStatusCode.Conflict)).HacerAlgoAsync("x");

        r.Outcome.Should().Be(BotOutcome.Rechazado);
        r.NoRespondio.Should().BeFalse("el chatbot contestó; lo que pasa es que dijo que no");
    }

    [Fact]
    public async Task ElBotNoContesta_EsNoResponde_NoUnRechazo()
    {
        var r = await ProxyQue(() => throw new HttpRequestException("conexión rechazada"))
            .HacerAlgoAsync("x");

        r.Outcome.Should().Be(BotOutcome.NoResponde);
        r.NoRespondio.Should().BeTrue("no llegó a intentarse: reintentar tiene sentido");
    }

    [Fact]
    public async Task UnaCaidaDelChatbot_SigueSinTumbarElPanel()
    {
        // La política que ya existía no cambia: una LECTURA que falla devuelve el
        // valor neutro y la pantalla se dibuja vacía, en vez de propagar y tirar
        // el panel entero mientras el chatbot se despliega.
        var acto = () => ProxyQue(() => throw new HttpRequestException("caído")).LeerAlgoAsync("x");

        (await acto.Should().NotThrowAsync()).Which.Should().Be(-1);
    }

    [Fact]
    public void ParaQuienNoLeImportaElMotivo_SigueSirviendoComoBool()
    {
        // Los avisos accesorios dentro de un comando —invalidar la identidad al
        // cambiar un teléfono— no deben complicarse: solo quieren saber si salió.
        bool hecho      = BotResult.Hecho;
        bool rechazado  = BotResult.Rechazado;
        bool noResponde = BotResult.NoResponde;

        hecho.Should().BeTrue();
        rechazado.Should().BeFalse();
        noResponde.Should().BeFalse();
    }
}
