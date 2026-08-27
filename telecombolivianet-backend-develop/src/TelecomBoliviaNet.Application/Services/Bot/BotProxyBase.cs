using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace TelecomBoliviaNet.Application.Services.Bot;

/// <summary>
/// Lo que comparten los tres adaptadores contra el chatbot: la autenticación de
/// la petición y la política de qué hacer cuando el chatbot no responde.
/// </summary>
public abstract class BotProxyBase
{
    protected readonly HttpClient _http;
    private   readonly ILogger    _log;
    private   readonly string     _internalToken;

    protected BotProxyBase(IHttpClientFactory httpFactory, IConfiguration cfg, ILogger log)
    {
        _http          = httpFactory.CreateClient("ChatbotMonitor");
        _log           = log;
        _internalToken = cfg["Chatbot:InternalToken"] ?? "";
    }

    protected HttpRequestMessage Auth(HttpMethod method, string url)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Add("Authorization", $"Bearer {_internalToken}");
        return req;
    }

    /// <summary>
    /// Ejecuta una llamada al chatbot y, si falla, la registra y devuelve el
    /// valor neutro en vez de propagar.
    ///
    /// <para>El chatbot es un servicio aparte que puede estar caído,
    /// reiniciándose o desplegándose. Que lo esté no debe tumbar el panel de
    /// administración entero: la pantalla se dibuja vacía y el resto del backend
    /// sigue funcionando. Ese es el motivo de tragar aquí, y estaba escrito en
    /// uno solo de los once bloques que hacían esto mismo (F5).</para>
    ///
    /// <para><b>Lo que esta política no distingue</b> —anotado como OBS-02—: en
    /// las operaciones que devuelven <c>bool</c>, un <c>false</c> significa a la
    /// vez "el bot rechazó la operación" y "no se pudo hablar con el bot". El
    /// operador ve lo mismo en los dos casos y no sabe si reintentar. Cambiarlo
    /// exige devolver un <c>Result</c> y tocar controlador y frontend.</para>
    /// </summary>
    /// <param name="siElBotNoResponde">Qué devolver cuando la llamada falla.</param>
    /// <param name="llamada">La llamada HTTP.</param>
    /// <param name="plantilla">Plantilla del log, con sus marcadores estructurados.</param>
    /// <param name="datos">Valores de esos marcadores.</param>
    protected async Task<T> SinRomperElPanelAsync<T>(
        T                siElBotNoResponde,
        Func<Task<T>>    llamada,
        string           plantilla,
        params object?[] datos)
    {
        try
        {
            return await llamada();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, plantilla, datos);
            return siElBotNoResponde;
        }
    }
}
