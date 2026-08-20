using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;

namespace TelecomBoliviaNet.Infrastructure.Services;

public class ResendEmailService : IEmailService
{
    private const string ResendApiUrl = "https://api.resend.com/emails";

    private readonly HttpClient              _http;
    private readonly ILogger<ResendEmailService> _logger;
    private readonly string _apiKey;
    private readonly string _fromAddress;
    private readonly string _fromName;
    private readonly int    _resetLinkExpiryHours;
    private readonly int    _activationLinkExpiryHours;

    public ResendEmailService(
        HttpClient                   http,
        IConfiguration               config,
        ILogger<ResendEmailService>  logger)
    {
        _http                      = http;
        _logger                    = logger;
        _apiKey                    = config["Email:ApiKey"]                       ?? string.Empty;
        _fromAddress               = config["Email:FromAddress"]                  ?? "onboarding@resend.dev";
        _fromName                  = config["Email:FromName"]                     ?? "TelecomBoliviaNet";
        _resetLinkExpiryHours      = int.TryParse(config["Email:ResetLinkExpiryHours"],      out var r) ? r : 1;
        _activationLinkExpiryHours = int.TryParse(config["Email:ActivationLinkExpiryHours"], out var a) ? a : 48;
    }

    public async Task SendPasswordResetAsync(string toEmail, string toName, string resetLink)
    {
        var subject = "Recuperación de contraseña — TelecomBoliviaNet";
        var html    = EmailTemplates.PasswordReset(toName, resetLink, _resetLinkExpiryHours);

        await SendAsync(toEmail, subject, html,
            stub: $"[EMAIL_STUB] Reset password para {toEmail} — enlace: {resetLink}");
    }

    public async Task SendPasswordChangedNotificationAsync(string toEmail, string toName)
    {
        var subject = "Tu contraseña fue actualizada — TelecomBoliviaNet";
        var html    = EmailTemplates.PasswordChanged(toName);

        await SendAsync(toEmail, subject, html,
            stub: $"[EMAIL_STUB] Notificación de cambio de contraseña para {toEmail}");
    }

    public async Task SendAccountActivationAsync(string toEmail, string toName, string activationLink)
    {
        var subject = "Activa tu cuenta — TelecomBoliviaNet";
        var html    = EmailTemplates.AccountActivation(toName, activationLink, _activationLinkExpiryHours);

        await SendAsync(toEmail, subject, html,
            stub: $"[EMAIL_STUB] Activación de cuenta para {toEmail} — enlace: {activationLink}");
    }


    private async Task SendAsync(string toEmail, string subject, string html, string stub)
    {
        if (string.IsNullOrEmpty(_apiKey))
        {
            _logger.LogWarning("{Stub}", stub);
            return;
        }

        _http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _apiKey);

        var payload = new
        {
            from    = $"{_fromName} <{_fromAddress}>",
            to      = new[] { toEmail },
            subject = subject,
            html    = html,
        };

        try
        {
            var response = await _http.PostAsJsonAsync(ResendApiUrl, payload);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync();
                _logger.LogError("Resend error {Status}: {Body}", response.StatusCode, body);
            }
            else
            {
                _logger.LogInformation("Email enviado a {Email} — asunto: {Subject}", toEmail, subject);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Excepción enviando email a {Email}", toEmail);
        }
    }

}
