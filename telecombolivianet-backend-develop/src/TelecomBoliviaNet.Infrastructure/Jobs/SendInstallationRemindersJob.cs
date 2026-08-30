using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Jobs;

public class SendInstallationRemindersJob : BackgroundService
{
    private readonly IServiceScopeFactory              _scopeFactory;
    private readonly ILogger<SendInstallationRemindersJob> _logger;

    public SendInstallationRemindersJob(IServiceScopeFactory s, ILogger<SendInstallationRemindersJob> l)
    { _scopeFactory = s; _logger = l; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var now  = DateTime.UtcNow;
            var next = now.AddMinutes(60 - now.Minute).AddSeconds(-now.Second);
            try { await Task.Delay(next - now, ct); } catch (TaskCanceledException) { break; }

            // RunAsync marca inst.ReminderSentAt, pero es leer-decidir-escribir: sin lease,
            // dos réplicas leen el flag a null a la vez y el cliente recibe dos
            // recordatorios de la misma instalación.
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await JobLease.TryRunExclusiveAsync(db, nameof(SendInstallationRemindersJob), () => RunAsync(ct), ct);
        }
    }

    private async Task RunAsync(CancellationToken ct)
    {
        var nowBolivia = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, NotifShared.BoliviaZone);
        if (nowBolivia.Hour < 8 || nowBolivia.Hour >= 20) return;

        var tomorrow = DateTime.UtcNow.AddDays(1).Date;

        using var scope  = _scopeFactory.CreateScope();
        var db           = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var publisher    = scope.ServiceProvider.GetRequiredService<INotifPublisher>();
        var botProxy     = scope.ServiceProvider.GetRequiredService<IBotOutboundProxy>();

        var installations = await db.Set<Installation>()
            .Include(i => i.Client)
            .Where(i => i.Fecha.Date == tomorrow
                     && (i.Status == InstallationStatus.Pendiente || i.Status == InstallationStatus.EnProceso)
                     && i.ReminderSentAt == null)
            .ToListAsync(ct);

        foreach (var inst in installations)
        {
            var clientPhone = inst.Client?.PhoneMain ?? inst.ProspectPhone;
            if (string.IsNullOrWhiteSpace(clientPhone)) continue;

            var nombre = inst.Client?.FullName ?? inst.ProspectName ?? "cliente";
            var fechaLocal = TimeZoneInfo.ConvertTimeFromUtc(inst.Fecha, NotifShared.BoliviaZone)
                .ToString("dd/MM/yyyy");
            var hora = inst.HoraInicio.ToString("HH:mm");

            try
            {
                // Preferente: confirmación interactiva vía chatbot (botones
                // Confirmar / Reagendar) para reducir no-shows. Si el chatbot
                // no responde, cae al recordatorio de texto plano por outbox.
                var sent = await botProxy.SendInstallationConfirmationAsync(
                    clientPhone, nombre, fechaLocal, hora, inst.Direccion);

                if (!sent)
                {
                    // NotifOutbox exige ClientId (FK NOT NULL) — para
                    // prospectos no hay fallback; se reintenta la próxima hora.
                    if (inst.Client is null) continue;

                    await publisher.PublishAsync(
                        NotifType.RECORDATORIO_INSTALACION,
                        inst.Client.Id,
                        clientPhone,
                        new Dictionary<string, string>
                        {
                            ["nombre"]    = nombre,
                            ["fecha"]     = fechaLocal,
                            ["hora"]      = hora,
                            ["direccion"] = inst.Direccion,
                        },
                        referenciaId: inst.Id);
                }

                inst.ReminderSentAt = DateTime.UtcNow;
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Reminder fallo para instalación {Id}: {Msg}", inst.Id, ex.Message);
            }
        }

        if (installations.Any(i => i.ReminderSentAt.HasValue))
            await db.SaveChangesAsync(ct);

        _logger.LogInformation("SendInstallationRemindersJob: {Count} recordatorios procesados.", installations.Count);
    }
}
