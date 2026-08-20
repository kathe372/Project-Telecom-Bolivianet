using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces.Notifications;

namespace TelecomBoliviaNet.Infrastructure.Services.Notifications;

public class EmailNotificationChannel : INotificationChannel
{
    private readonly ILogger<EmailNotificationChannel> _logger;

    public string ChannelName => "Email";

    public EmailNotificationChannel(ILogger<EmailNotificationChannel> logger)
    {
        _logger = logger;
    }

    public bool CanHandle(string recipient) =>
        recipient.Contains('@');

    public Task EnqueueAsync(NotifChannelMessage msg, CancellationToken ct = default)
    {
        _logger.LogInformation("EmailChannel: stub — not yet implemented for {ClientId}", msg.ClientId);
        return Task.CompletedTask;
    }
}
