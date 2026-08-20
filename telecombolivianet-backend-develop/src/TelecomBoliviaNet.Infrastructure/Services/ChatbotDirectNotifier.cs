using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.ValueObjects;

namespace TelecomBoliviaNet.Infrastructure.Services;

public class ChatbotDirectNotifier : IChatbotDirectNotifier
{
    private readonly IHttpClientFactory              _httpFactory;
    private readonly IConfiguration                  _config;
    private readonly ILogger<ChatbotDirectNotifier>  _logger;

    public ChatbotDirectNotifier(
        IHttpClientFactory             httpFactory,
        IConfiguration                 config,
        ILogger<ChatbotDirectNotifier> logger)
    {
        _httpFactory = httpFactory;
        _config      = config;
        _logger      = logger;
    }

    public async Task<bool> SendPaymentConfirmationAsync(
        string  phoneNumber,
        string  clientName,
        decimal amount,
        string  coveredPeriod)
    {
        try
        {
            var token = _config["Chatbot:BotToken"] ?? string.Empty;
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning(
                    "[ChatbotDirect] Chatbot:BotToken no configurado — usando fallback al notifier.");
                return false;
            }

            var phone   = FormatPhone(phoneNumber);
            var message = BuildMessage(clientName, amount, coveredPeriod);

            var http = _httpFactory.CreateClient("ChatbotMonitor");
            http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);

            var response = await http.PostAsJsonAsync(
                $"/monitor/conversations/{phone}/send",
                new { text = message });

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation(
                    "[ChatbotDirect] Confirmación enviada a {Phone} (ventana 24h, sin costo de template).",
                    phone);
                return true;
            }

            var body = await response.Content.ReadAsStringAsync();
            _logger.LogWarning(
                "[ChatbotDirect] Error al enviar a {Phone}: HTTP {Status} — {Body}",
                phone, (int)response.StatusCode, body);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "[ChatbotDirect] Excepción al enviar confirmación a {Phone}.",
                phoneNumber);
            return false;
        }
    }

    public async Task<bool> SendPlanChangeConfirmationAsync(
        string phoneNumber,
        string clientName,
        string planName)
    {
        try
        {
            var token = _config["Chatbot:BotToken"] ?? string.Empty;
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning(
                    "[ChatbotDirect] Chatbot:BotToken no configurado — no se puede enviar confirmación de plan.");
                return false;
            }

            var phone   = FormatPhone(phoneNumber);
            var message =
                $"Estimado/a {clientName},\n\n" +
                $"Le informamos que su plan de servicio ha sido actualizado a *{planName}* de forma inmediata.\n\n" +
                $"Si tiene alguna consulta sobre su nuevo plan, estamos a su disposición.\n\n" +
                $"Atentamente,\nTelecomBoliviaNet 🙏";

            var http = _httpFactory.CreateClient("ChatbotMonitor");
            http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);

            var response = await http.PostAsJsonAsync(
                $"/monitor/conversations/{phone}/send",
                new { text = message });

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation(
                    "[ChatbotDirect] Confirmación de cambio de plan enviada a {Phone} (ventana 24h).", phone);
                return true;
            }

            var body = await response.Content.ReadAsStringAsync();
            _logger.LogWarning(
                "[ChatbotDirect] Error enviando confirmación de plan a {Phone}: HTTP {Status} — {Body}",
                phone, (int)response.StatusCode, body);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "[ChatbotDirect] Excepción al enviar confirmación de plan a {Phone}.", phoneNumber);
            return false;
        }
    }

    public async Task<bool> SendPaymentRejectionAsync(
        string phoneNumber,
        string clientName,
        string reason)
    {
        try
        {
            var token = _config["Chatbot:BotToken"] ?? string.Empty;
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning(
                    "[ChatbotDirect] Chatbot:BotToken no configurado — no se puede notificar rechazo.");
                return false;
            }

            var phone   = FormatPhone(phoneNumber);
            var message =
                $"Estimado/a {clientName},\n\n" +
                $"Le informamos que el comprobante de pago que nos envió *no pudo ser procesado*.\n\n" +
                $"⚠️ Motivo: {reason}\n\n" +
                $"Por favor verifique y envíe el comprobante correcto. " +
                $"Si tiene alguna consulta, estamos a su disposición.\n\n" +
                $"Atentamente,\nTelecomBoliviaNet 🙏";

            var http = _httpFactory.CreateClient("ChatbotMonitor");
            http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);

            var response = await http.PostAsJsonAsync(
                $"/monitor/conversations/{phone}/send",
                new { text = message });

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation(
                    "[ChatbotDirect] Notificación de rechazo enviada a {Phone} (ventana 24h).", phone);
                return true;
            }

            var body = await response.Content.ReadAsStringAsync();
            _logger.LogWarning(
                "[ChatbotDirect] Error enviando rechazo a {Phone}: HTTP {Status} — {Body}",
                phone, (int)response.StatusCode, body);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "[ChatbotDirect] Excepción al enviar rechazo a {Phone}.", phoneNumber);
            return false;
        }
    }

    private static string BuildMessage(string clientName, decimal amount, string coveredPeriod)
        => $"Estimado/a {clientName},\n" +
           $"Le saluda TelecomBoliviaNet, su proveedor de servicios de internet.\n\n" +
           $"Confirmamos la recepción de su pago por Bs. {amount:F2}, " +
           $"correspondiente al/los período(s): {coveredPeriod}.\n\n" +
           $"Su servicio se mantiene activo con normalidad. " +
           $"Agradecemos su puntualidad y la confianza depositada en nosotros.\n\n" +
           $"Atentamente,\nTelecomBoliviaNet 🙏";

    /// <summary>
    /// D1 (2026-08-07): antes esto AGREGABA el prefijo "591". El chatbot indexa
    /// sus conversaciones por el número LOCAL de 8 dígitos, así que
    /// POST /monitor/conversations/591XXXXXXXX/send devolvía 404 y la
    /// confirmación de pago (o de cambio de plan, o el rechazo de comprobante)
    /// nunca llegaba al cliente. Ver PhoneNumber.ToLocalCanonical.
    /// </summary>
    private static string FormatPhone(string phone)
        => PhoneNumber.ToLocalCanonical(phone);
}
