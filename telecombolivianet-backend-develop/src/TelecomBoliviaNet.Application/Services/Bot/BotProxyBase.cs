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
    /// <para>Para las LECTURAS sigue valiendo: una lista vacía se dibuja igual
    /// de bien que una llena. Para las operaciones que cambian algo, usa
    /// <see cref="IntentarAsync"/>, que sí distingue "el bot dijo que no" de "el
    /// bot no responde" (OBS-02).</para>
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

    /// <summary>
    /// Igual que <see cref="SinRomperElPanelAsync"/> pero para operaciones que
    /// CAMBIAN algo: distingue las tres salidas en vez de colapsarlas en un
    /// <c>false</c>.
    /// </summary>
    /// <remarks>
    /// OBS-02 — La diferencia le importa a quien está delante de la pantalla. Si
    /// el chatbot rechazó la operación —la conversación ya la tiene otro agente—
    /// insistir no sirve de nada. Si el chatbot no respondió, insistir en un
    /// minuto probablemente sí. Con un solo <c>false</c>, el operador no podía
    /// saber cuál de las dos cosas le había pasado.
    /// </remarks>
    /// <param name="llamada">Devuelve true si el chatbot ACEPTÓ la operación.</param>
    protected async Task<BotResult> IntentarAsync(
        Func<Task<bool>> llamada,
        string           plantilla,
        params object?[] datos)
    {
        try
        {
            return BotResult.De(await llamada());
        }
        catch (Exception ex)
        {
            // Sigue sin propagar —el panel no se cae porque el chatbot esté
            // desplegándose— pero ahora se sabe que fue esto y no un rechazo.
            _log.LogWarning(ex, plantilla, datos);
            return BotResult.NoResponde;
        }
    }
}
