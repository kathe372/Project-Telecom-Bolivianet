using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;

namespace TelecomBoliviaNet.Infrastructure.Services;

/// <summary>
/// Envío de emails vía SMTP (Gmail con contraseña de aplicación por defecto).
/// A diferencia de Resend en modo sandbox, permite enviar a cualquier destinatario.
/// Sin usuario/contraseña configurados opera en modo STUB (solo loguea).
/// </summary>
public class SmtpEmailService : IEmailService
{
    private readonly ILogger<SmtpEmailService> _logger;
    private readonly string _host;
    private readonly int    _port;
    private readonly string _user;
    private readonly string _password;
    private readonly string _fromAddress;
    private readonly string _fromName;
    private readonly int    _resetLinkExpiryHours;
    private readonly int    _activationLinkExpiryHours;

    public SmtpEmailService(IConfiguration config, ILogger<SmtpEmailService> logger)
    {
        _logger   = logger;
        _host     = config["Email:Smtp:Host"] ?? "smtp.gmail.com";
        _port     = int.TryParse(config["Email:Smtp:Port"], out var p) ? p : 587;
        _user     = config["Email:Smtp:User"] ?? string.Empty;
        // Gmail muestra las contraseñas de aplicación con espacios ("abcd efgh ijkl mnop")
        _password = (config["Email:Smtp:Password"] ?? string.Empty).Replace(" ", "");

        // Gmail ignora remitentes distintos a la cuenta autenticada
        _fromAddress = config["Email:FromAddress"] is { Length: > 0 } from && !from.EndsWith("@resend.dev")
            ? from
            : _user;
        _fromName    = config["Email:FromName"] ?? "TelecomBoliviaNet";

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
        if (string.IsNullOrEmpty(_user) || string.IsNullOrEmpty(_password))
        {
            _logger.LogWarning("{Stub}", stub);
            return;
        }

        try
        {
            using var client = new SmtpClient(_host, _port)
            {
                EnableSsl   = true,
                Credentials = new NetworkCredential(_user, _password),
            };

            using var message = new MailMessage
            {
                From       = new MailAddress(_fromAddress, _fromName),
                Subject    = subject,
                Body       = html,
                IsBodyHtml = true,
            };
            message.To.Add(toEmail);

            await client.SendMailAsync(message);
            _logger.LogInformation("Email enviado a {Email} — asunto: {Subject}", toEmail, subject);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Excepción enviando email SMTP a {Email}", toEmail);
        }
    }
}
