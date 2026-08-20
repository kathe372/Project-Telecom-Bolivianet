using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Jobs;

public class CompanyQrExpiryAlertJob : BackgroundService
{
    private readonly IServiceScopeFactory             _scopeFactory;
    private readonly ILogger<CompanyQrExpiryAlertJob> _logger;

    private static readonly int[] AlertDays = [7, 3, 1];

    public CompanyQrExpiryAlertJob(
        IServiceScopeFactory              scopeFactory,
        ILogger<CompanyQrExpiryAlertJob>  logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _logger.LogInformation("CompanyQrExpiryAlertJob iniciado.");

        DateTime? lastRunDate = null;

        while (!ct.IsCancellationRequested)
        {
            var nowBolivia = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, NotifShared.BoliviaZone);
            var today      = nowBolivia.Date;

            if (nowBolivia.Hour == 8 && nowBolivia.Minute is >= 0 and <= 10
                && lastRunDate != today)
            {
                lastRunDate = today;
                await RunAsync(today, ct);
                await Task.Delay(TimeSpan.FromMinutes(15), ct);
                continue;
            }

            await Task.Delay(TimeSpan.FromMinutes(1), ct);
        }
    }

    private async Task RunAsync(DateTime today, CancellationToken ct)
    {
        try
        {
            using var scope    = _scopeFactory.CreateScope();
            var db             = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var whatsapp       = scope.ServiceProvider.GetRequiredService<IWhatsAppNotifier>();

            var configs = await db.SystemConfigs.AsNoTracking()
                .Where(c => c.Key == SystemConfigKeys.CompanyQrExpiresAt
                         || c.Key == SystemConfigKeys.AdminPhoneNumber
                         || c.Key == SystemConfigKeys.CompanyQrAlertSentDate)
                .ToListAsync(ct);

            var expiresAtRaw   = configs.FirstOrDefault(c => c.Key == SystemConfigKeys.CompanyQrExpiresAt)?.Value;
            var adminPhone     = configs.FirstOrDefault(c => c.Key == SystemConfigKeys.AdminPhoneNumber)?.Value;
            var alertSentDate  = configs.FirstOrDefault(c => c.Key == SystemConfigKeys.CompanyQrAlertSentDate)?.Value;

            if (string.IsNullOrWhiteSpace(expiresAtRaw) || string.IsNullOrWhiteSpace(adminPhone))
            {
                _logger.LogDebug("CompanyQrExpiryAlertJob: sin fecha de vencimiento o teléfono de admin configurado.");
                return;
            }

            if (!DateOnly.TryParse(expiresAtRaw, out var expiresAt))
            {
                _logger.LogWarning("CompanyQrExpiryAlertJob: fecha de vencimiento inválida: {Value}", expiresAtRaw);
                return;
            }

            var todayStr = today.ToString("yyyy-MM-dd");
            if (alertSentDate == todayStr)
            {
                _logger.LogDebug("CompanyQrExpiryAlertJob: alerta ya enviada hoy ({Date}).", todayStr);
                return;
            }

            var expiryDate   = expiresAt.ToDateTime(TimeOnly.MinValue);
            var daysRemaining = (int)Math.Round((expiryDate - today).TotalDays);

            bool shouldAlert = daysRemaining <= 0
                            || AlertDays.Contains(daysRemaining);

            if (!shouldAlert)
            {
                _logger.LogDebug(
                    "CompanyQrExpiryAlertJob: QR vence en {Days} días — sin alerta hoy.", daysRemaining);
                return;
            }

            var mensaje = daysRemaining <= 0
                ? $"🚨 *Alerta QR de pago — TelecomBoliviaNet*\n\n" +
                  $"El QR de pago de la empresa *venció hace {Math.Abs(daysRemaining)} día(s)* ({expiresAt:dd/MM/yyyy}).\n\n" +
                  $"Los clientes no pueden pagar con QR. Actualiza el QR desde el panel de administración de inmediato."
                : $"⚠️ *Alerta QR de pago — TelecomBoliviaNet*\n\n" +
                  $"El QR de pago de la empresa vence en *{daysRemaining} día(s)* ({expiresAt:dd/MM/yyyy}).\n\n" +
                  $"Actualiza el QR desde el panel de administración para que los clientes puedan seguir pagando.";

            await whatsapp.SendTextAsync(adminPhone, mensaje);

            var sentCfg = await db.SystemConfigs
                .FirstOrDefaultAsync(c => c.Key == SystemConfigKeys.CompanyQrAlertSentDate, ct);
            if (sentCfg is null)
                db.SystemConfigs.Add(new SystemConfig
                {
                    Key = SystemConfigKeys.CompanyQrAlertSentDate,
                    Value = todayStr,
                    UpdatedAt = DateTime.UtcNow,
                });
            else
            {
                sentCfg.Value     = todayStr;
                sentCfg.UpdatedAt = DateTime.UtcNow;
            }
            await db.SaveChangesAsync(ct);

            _logger.LogInformation(
                "CompanyQrExpiryAlertJob: alerta enviada a {Phone}. QR vence en {Days} día(s) ({Date:dd/MM/yyyy}).",
                adminPhone, daysRemaining, expiryDate);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "CompanyQrExpiryAlertJob: error en ejecución.");
        }
    }
}
