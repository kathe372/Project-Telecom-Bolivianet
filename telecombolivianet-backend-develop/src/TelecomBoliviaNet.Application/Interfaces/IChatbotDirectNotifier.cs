namespace TelecomBoliviaNet.Application.Interfaces;

public interface IChatbotDirectNotifier
{
    Task<bool> SendPaymentConfirmationAsync(
        string  phoneNumber,
        string  clientName,
        decimal amount,
        string  coveredPeriod);

    Task<bool> SendPlanChangeConfirmationAsync(
        string phoneNumber,
        string clientName,
        string planName);

    Task<bool> SendPaymentRejectionAsync(
        string phoneNumber,
        string clientName,
        string reason);
}
