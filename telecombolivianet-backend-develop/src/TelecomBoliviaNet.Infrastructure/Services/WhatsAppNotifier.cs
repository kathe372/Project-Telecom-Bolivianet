using System.Net.Http.Json;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Admin;

namespace TelecomBoliviaNet.Infrastructure.Services;

public class WhatsAppNotifier : IWhatsAppNotifier
{
    private readonly HttpClient                _http;
    private readonly AdminSettingsService      _adminSettings;
    private readonly ILogger<WhatsAppNotifier> _logger;

    public WhatsAppNotifier(
        HttpClient                http,
        AdminSettingsService      adminSettings,
        ILogger<WhatsAppNotifier> logger)
    {
        _http          = http;
        _adminSettings = adminSettings;
        _logger        = logger;
    }

    public async Task SendTextAsync(string phoneNumber, string message)
    {
        var settings  = await _adminSettings.GetCurrentAsync();
        var token     = settings.WhatsAppToken;
        var phoneId   = settings.WhatsAppPhoneNumberId;
        var apiVersion = settings.WhatsAppApiVersion;

        if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(phoneId))
        {
            _logger.LogWarning("[WhatsApp STUB] → {Phone}: {Message}", phoneNumber, message);
            return;
        }

        _http.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        var formattedPhone = FormatPhone(phoneNumber);

        var payload = new
        {
            messaging_product = "whatsapp",
            to   = formattedPhone,
            type = "text",
            text = new { body = message }
        };

        var url = $"https://graph.facebook.com/{apiVersion}/{phoneId}/messages";

        try
        {
            var response = await _http.PostAsJsonAsync(url, payload);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync();
                _logger.LogError("Error WhatsApp {Status}: {Body}", response.StatusCode, body);
            }
            else
            {
                _logger.LogInformation("WhatsApp enviado a {Phone}", formattedPhone);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Excepción enviando WhatsApp a {Phone}", formattedPhone);
        }
    }

    private static string FormatPhone(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.StartsWith("591")) return digits;
        if (digits.Length == 8)      return $"591{digits}";
        return digits;
    }
}
