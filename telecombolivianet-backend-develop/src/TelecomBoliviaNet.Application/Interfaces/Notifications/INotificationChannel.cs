namespace TelecomBoliviaNet.Application.Interfaces.Notifications;

public interface INotificationChannel
{
    string ChannelName { get; }

    bool CanHandle(string recipient);

    Task EnqueueAsync(
        NotifChannelMessage message,
        CancellationToken ct = default);
}

public record NotifChannelMessage(
    Guid   ClientId,
    string Recipient,
    string NotifType,
    Dictionary<string, string> Context,
    DateTime SendAfter,
    Guid? ReferenceId = null);
