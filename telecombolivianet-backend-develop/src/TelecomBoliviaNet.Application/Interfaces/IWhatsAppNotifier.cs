namespace TelecomBoliviaNet.Application.Interfaces;

public interface IWhatsAppNotifier
{
    Task SendTextAsync(string phoneNumber, string message);
}
