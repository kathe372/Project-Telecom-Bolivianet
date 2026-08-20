using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Clients;
using TelecomBoliviaNet.Application.Services.Notifications;

namespace TelecomBoliviaNet.Infrastructure.Jobs;

public class QrExpiryAlertJob : BackgroundService
{
    private readonly IServiceScopeFactory      _scopeFactory;
    private readonly ILogger<QrExpiryAlertJob> _logger;

    public QrExpiryAlertJob(
        IServiceScopeFactory       scopeFactory,
        ILogger<QrExpiryAlertJob>  logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _logger.LogInformation("QrExpiryAlertJob iniciado.");

        DateTime? lastRunDate = null;

        while (!ct.IsCancellationRequested)
        {
            var nowBolivia = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, NotifShared.BoliviaZone);
            var today      = nowBolivia.Date;

            if (nowBolivia.Hour == 9 && nowBolivia.Minute is >= 0 and <= 10
                && lastRunDate != today)
            {
                lastRunDate = today;
                await RunAsync();
                await Task.Delay(TimeSpan.FromMinutes(15), ct);
                continue;
            }

            await Task.Delay(TimeSpan.FromMinutes(1), ct);
        }
    }

    private async Task RunAsync()
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var svc = scope.ServiceProvider.GetRequiredService<ClientQrService>();
            var hub = scope.ServiceProvider.GetRequiredService<IAdminHubNotifier>();

            var expiring = await svc.GetQrsExpiringSoonAsync();

            if (!expiring.Any())
            {
                _logger.LogDebug("QrExpiryAlertJob: sin QRs próximos a vencer.");
                return;
            }

            _logger.LogInformation("QrExpiryAlertJob: {Count} QR(s) próximos a vencer.", expiring.Count);

            foreach (var (clientId, clientName, tbnCode, expiresAt) in expiring)
            {
                var daysLeft = (int)Math.Round((expiresAt - DateTime.UtcNow).TotalDays);

                var payload = new
                {
                    EventType  = "QR_EXPIRING_SOON",
                    ClientId   = clientId.ToString(),
                    ClientName = clientName,
                    TbnCode    = tbnCode,
                    ExpiresAt  = expiresAt.ToString("O"),
                    DaysLeft   = daysLeft,
                    Message    = $"El QR de {tbnCode} – {clientName} vence en {daysLeft} día(s).",
                    ReceivedAt = DateTimeOffset.UtcNow.ToString("O"),
                };

                await hub.SendToAllAsync("QrExpiringSoon", payload);

                await svc.MarkAlertSentAsync(clientId);

                _logger.LogInformation(
                    "Alerta QR enviada: {TbnCode} — vence {ExpiresAt:dd/MM/yyyy}",
                    tbnCode, expiresAt);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "QrExpiryAlertJob: error en ejecución.");
        }
    }
}
