using System.Text.Json;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces.Notifications;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Infrastructure.Services.Notifications;

public class WhatsAppNotificationChannel : INotificationChannel
{
    private readonly IGenericRepository<NotifOutbox> _outboxRepo;
    private readonly ILogger<WhatsAppNotificationChannel> _logger;

    public string ChannelName => "WhatsApp";

    public WhatsAppNotificationChannel(
        IGenericRepository<NotifOutbox> outboxRepo,
        ILogger<WhatsAppNotificationChannel> logger)
    {
        _outboxRepo = outboxRepo;
        _logger     = logger;
    }

    public bool CanHandle(string recipient) =>
        !string.IsNullOrWhiteSpace(recipient) &&
        recipient.All(c => char.IsDigit(c) || c == '+');

    public async Task EnqueueAsync(NotifChannelMessage msg, CancellationToken ct = default)
    {
        var outbox = new NotifOutbox
        {
            Tipo         = Enum.Parse<NotifType>(msg.NotifType),
            ClienteId    = msg.ClientId,
            PhoneNumber  = msg.Recipient,
            Publicado    = false,
            Intentos     = 0,
            EnviarDesde  = msg.SendAfter,
            EstadoFinal  = null,
            CreadoAt     = DateTime.UtcNow,
            ContextoJson = JsonSerializer.Serialize(msg.Context),
            ReferenciaId = msg.ReferenceId,
        };

        await _outboxRepo.AddAsync(outbox);
        _logger.LogInformation(
            "WhatsAppChannel: enqueued {Type} for client {ClientId}",
            msg.NotifType, msg.ClientId);
    }
}
