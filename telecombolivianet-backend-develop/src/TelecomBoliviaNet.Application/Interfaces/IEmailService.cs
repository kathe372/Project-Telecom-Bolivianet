namespace TelecomBoliviaNet.Application.Interfaces;

public interface IEmailService
{
    Task SendPasswordResetAsync(string toEmail, string toName, string resetLink);
    Task SendPasswordChangedNotificationAsync(string toEmail, string toName);
    Task SendAccountActivationAsync(string toEmail, string toName, string activationLink);
}
