using System.Net;
using Microsoft.Extensions.Http.Resilience;
using Polly;

namespace TelecomBoliviaNet.Presentation.Configuration;

/// <summary>
/// Reintentos para las integraciones HTTP salientes (F8.2).
/// </summary>
/// <remarks>
/// No había ninguno: cualquier corte momentáneo con Meta, Resend o Nominatim
/// perdía la operación entera y quedaba en un <c>LogError</c> que nadie lee.
///
/// <para><b>Por qué no es el mismo ajuste para todas.</b> Reintentar un GET es
/// gratis; reintentar un POST que ya pudo haberse ejecutado puede duplicar un
/// efecto en el mundo real —un correo, un mensaje—. Por eso cada integración
/// declara aquí qué asume, y la diferencia está en
/// <paramref name="soloSiElServidorRespondio"/>.</para>
///
/// <para><b>Dónde NO se aplica:</b> el cliente <c>ChatbotMonitor</c>. No es un
/// olvido — <c>ChatbotDirectNotifier</c> ya tiene una alternativa deliberada: si
/// el chatbot no contesta, el aviso sale por el notifier con plantilla.
/// Reintentos donde no hay alternativa; alternativa donde la hay. Encadenar las
/// dos solo retrasaría la caída al camino que ya funciona.</para>
/// </remarks>
public static class HttpResilience
{
    /// <param name="intentosExtra">Reintentos DESPUÉS del primer envío.</param>
    /// <param name="segundosPorIntento">Tope de cada intento por separado.</param>
    /// <param name="soloSiElServidorRespondio">
    /// Con <c>true</c> solo se reintenta cuando el servidor contestó un 5xx o un
    /// 429 — es decir, cuando consta que RECHAZÓ la petición y no hizo nada con
    /// ella. Un corte de red o un tiempo agotado NO se reintentan, porque desde
    /// aquí no hay forma de distinguir "no llegó" de "llegó, se ejecutó y se
    /// perdió la respuesta". Es lo que corresponde cuando repetir la petición
    /// duplicaría algo que ve una persona.
    ///
    /// Con <c>false</c> se reintenta también ante fallo de red o timeout: sirve
    /// para lecturas, y para envíos cuyo duplicado no molesta a nadie.
    /// </param>
    /// <param name="retardoBase">
    /// Solo para tests: permite comprobar el reintento sin esperar los segundos
    /// del backoff real.
    /// </param>
    public static IHttpClientBuilder ConReintentos(
        this IHttpClientBuilder builder,
        int       intentosExtra,
        int       segundosPorIntento,
        bool      soloSiElServidorRespondio,
        TimeSpan? retardoBase = null)
    {
        builder.AddStandardResilienceHandler(o =>
        {
            o.AttemptTimeout.Timeout = TimeSpan.FromSeconds(segundosPorIntento);

            // Con margen para el backoff entre intentos; si el total quedara por
            // debajo, el pipeline se cortaría antes de agotar los reintentos que
            // acabamos de configurar.
            o.TotalRequestTimeout.Timeout =
                TimeSpan.FromSeconds(segundosPorIntento * (intentosExtra + 1) + 30);

            // La librería exige que la ventana del cortacircuitos sea al menos el
            // doble del tope por intento.
            o.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(segundosPorIntento * 2);

            o.Retry.MaxRetryAttempts = intentosExtra;
            o.Retry.BackoffType      = DelayBackoffType.Exponential;
            o.Retry.UseJitter        = true;   // que los jobs no reintenten todos a la vez

            if (retardoBase is not null) o.Retry.Delay = retardoBase.Value;

            if (soloSiElServidorRespondio)
                o.Retry.ShouldHandle = args => ValueTask.FromResult(ElServidorLoRechazo(args.Outcome));
        });

        return builder;
    }

    /// <summary>
    /// El servidor contestó, y contestó que no. Es la única señal que prueba que
    /// la petición no surtió efecto.
    /// </summary>
    private static bool ElServidorLoRechazo(Outcome<HttpResponseMessage> resultado)
        => resultado.Result is { } r
        && ((int)r.StatusCode >= 500 || r.StatusCode == HttpStatusCode.TooManyRequests);
}
