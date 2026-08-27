using TelecomBoliviaNet.Application.Interfaces;
using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Domain.ValueObjects;

namespace TelecomBoliviaNet.Application.Services.Bot;

/// <summary>
/// Avisos que el backend le pide al chatbot que entregue. Ver
/// <see cref="BotProxyBase"/> para qué ocurre cuando el chatbot no responde.
/// </summary>
public class BotOutboundProxy : BotProxyBase, IBotOutboundProxy
{
    public BotOutboundProxy(
        IHttpClientFactory         httpFactory,
        IConfiguration             cfg,
        ILogger<BotOutboundProxy>  log)
        : base(httpFactory, cfg, log) { }

    public Task<bool> SendInstallationConfirmationAsync(
        string phone, string nombre, string fecha, string hora, string direccion)
        => SinRomperElPanelAsync(
            false,
            async () =>
            {
                var req = Auth(HttpMethod.Post, "bot/notify-client");
                req.Content = JsonContent.Create(new
                {
                    PhoneNumber = NormalizeBolivianPhone(phone),
                    EventType   = "INSTALLATION_CONFIRMATION",
                    Metadata    = new
                    {
                        Nombre           = nombre,
                        InstallationDate = fecha,
                        Hora             = hora,
                        Direccion        = direccion,
                    },
                });
                var res = await _http.SendAsync(req);
                return res.IsSuccessStatusCode;
            },
            "BotProxy: error al enviar confirmación de instalación a {Phone}", phone);

    /// <summary>
    /// Avisa al chatbot de que su identidad cacheada para ese número dejó de ser
    /// válida.
    ///
    /// <para>Tragar el error aquí tiene una razón propia además de la general: el
    /// re-chequeo periódico del chatbot (hasta 2 h) sigue funcionando como red de
    /// seguridad si este aviso inmediato falla, así que un fallo retrasa la
    /// invalidación pero no la pierde. Y no debe bloquear el guardado del
    /// cliente, que es lo que el operador estaba haciendo.</para>
    /// </summary>
    public Task<bool> InvalidateIdentityAsync(string phone)
        => SinRomperElPanelAsync(
            false,
            async () =>
            {
                var req = Auth(HttpMethod.Post, "bot/invalidate-identity");
                req.Content = JsonContent.Create(new { Phone = NormalizeBolivianPhone(phone) });
                var res = await _http.SendAsync(req);
                return res.IsSuccessStatusCode;
            },
            "BotProxy: error al invalidar identidad cacheada para {Phone}", phone);

    /// <summary>
    /// D1 (2026-08-07): antes esto AGREGABA el prefijo "591". El chatbot guarda
    /// y busca por el número LOCAL de 8 dígitos, así que cada llamada con
    /// prefijo no encontraba la conversación. Ver PhoneNumber.ToLocalCanonical.
    /// </summary>
    private static string NormalizeBolivianPhone(string phone)
        => PhoneNumber.ToLocalCanonical(phone);

}
