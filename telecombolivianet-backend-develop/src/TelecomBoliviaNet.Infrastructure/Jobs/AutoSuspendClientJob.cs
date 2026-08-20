using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Constants;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Jobs;

public class AutoSuspendClientJob : BackgroundService
{
    private readonly IServiceScopeFactory          _scopeFactory;
    private readonly ILogger<AutoSuspendClientJob> _logger;

    /// <summary>Clientes por lote. Acota la memoria, no el total procesado.</summary>
    private const int SuspendBatchSize = 100;

    /// <summary>Tope de lotes por corrida (10.000 clientes). Red de seguridad anti-bucle.</summary>
    private const int MaxRoundsPerRun = 100;

    /// <summary>Gracia tras un pago reciente antes de suspender.</summary>
    private const int GraceHoursAfterPayment = 24;

    public AutoSuspendClientJob(IServiceScopeFactory s, ILogger<AutoSuspendClientJob> l)
    { _scopeFactory = s; _logger = l; }

    /// <summary>
    /// Antes esto era "dormir hasta la hora y ejecutar". Si el contenedor se
    /// desplegaba después de la hora programada, la corrida de ese día se perdía
    /// por completo y nada la reintentaba: con despliegues frecuentes el sistema
    /// pasaba días sin suspender a nadie.
    ///
    /// Ahora se comprueba cada minuto si ya pasó la hora del día y si la corrida
    /// de hoy sigue pendiente (catch-up), usando el mismo patrón que
    /// <c>BillingSchedule.ShouldRunOverdue</c>.
    /// </summary>
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using (var scope = _scopeFactory.CreateScope())
                {
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var lastRunDay = await JobRunTracker.ReadLastRunAsync(
                        db, SystemConfigKeys.AutoSuspendLastRunDay, ct);

                    if (JobSchedule.ShouldRunDaily(
                            DateTime.UtcNow, lastRunDay,
                            AppConstants.Time.AutoSuspendRunHour,
                            AppConstants.Time.AutoSuspendRunMinute))
                    {
                        await RunAsync(ct);
                        await JobRunTracker.MarkRanAsync(
                            db, SystemConfigKeys.AutoSuspendLastRunDay,
                            JobSchedule.DayKey(DateTime.UtcNow), ct);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "AutoSuspendClientJob: error en el ciclo de comprobación.");
            }

            try { await Task.Delay(TimeSpan.FromMinutes(1), ct); }
            catch (TaskCanceledException) { break; }
        }
    }

    private async Task RunAsync(CancellationToken ct)
    {
        using var scope    = _scopeFactory.CreateScope();
        var db             = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var notifPublisher = scope.ServiceProvider.GetRequiredService<INotifPublisher>();

        var configs = await db.SystemConfigs.ToListAsync(ct);
        var activo  = configs.FirstOrDefault(c => c.Key == SystemConfigKeys.AutoSuspendActivo)?.Value == "true";
        if (!activo)
        {
            _logger.LogInformation("AutoSuspendClientJob: desactivado por configuración.");
            return;
        }

        var diasStr = configs.FirstOrDefault(c => c.Key == SystemConfigKeys.AutoSuspendDiasGracia)?.Value;
        var dias    = int.TryParse(diasStr, out var d) ? d : 10;
        var cutoff  = DateTime.UtcNow.AddDays(-dias);

        // Un cliente suspendido sale solo del filtro (cambia de estado), así que el
        // lote siguiente avanza por sí mismo. Los únicos que permanecerían dando
        // vueltas son los omitidos por pago reciente, así que se excluyen
        // explícitamente: es un conjunto pequeño (pagos de las últimas 24 h dentro
        // de los morosos), no la lista completa de procesados.
        var skippedIds = new List<Guid>();
        int suspended = 0, skippedRecentPayer = 0, errors = 0, rounds = 0;

        while (rounds++ < MaxRoundsPerRun)
        {
            // Antes había un `.Take(20)` SIN `OrderBy`: solo se evaluaban 20 clientes
            // al día y, al no haber orden determinista, PostgreSQL tendía a devolver
            // siempre las mismas filas — el resto no se suspendía NUNCA, mientras el
            // log reportaba "20 clientes suspendidos" cada día.
            var excluded = skippedIds;
            var batch = await db.Clients
                .Include(c => c.Plan)
                .Where(c => c.Status == ClientStatus.Activo && !c.IsDeleted &&
                            !excluded.Contains(c.Id) &&
                            db.Invoices.Any(i =>
                                i.ClientId == c.Id && !i.IsDeleted &&
                                i.Status == InvoiceStatus.Vencida &&
                                i.DueDate <= cutoff))
                .OrderBy(c => c.Id)
                .Take(SuspendBatchSize)
                .ToListAsync(ct);

            if (batch.Count == 0) break;

            var batchIds    = batch.Select(c => c.Id).ToList();
            var graceWindow = DateTime.UtcNow.AddHours(-GraceHoursAfterPayment);
            var recentPayerSet = (await db.Payments
                .Where(p => batchIds.Contains(p.ClientId) && !p.IsDeleted &&
                            !p.IsVoided && p.PaidAt >= graceWindow)
                .Select(p => p.ClientId)
                .Distinct()
                .ToListAsync(ct)).ToHashSet();

            int suspendedInBatch = 0;
            foreach (var client in batch)
            {
                if (recentPayerSet.Contains(client.Id))
                {
                    skippedRecentPayer++;
                    skippedIds.Add(client.Id);   // que no vuelva a salir en el próximo lote
                    continue;
                }

                try
                {
                    client.Suspend();

                    await notifPublisher.PublishAsync(
                        NotifType.SUSPENSION,
                        client.Id,
                        client.PhoneMain,
                        new Dictionary<string, string>
                        {
                            ["nombre"] = client.FullName.Split(' ')[0],
                            ["plan"]   = client.Plan?.Name ?? "su plan",
                        });

                    db.AuditLogs.Add(new AuditLog
                    {
                        UserName    = "Sistema",
                        Module      = "Clientes",
                        Action      = "AUTO_SUSPEND",
                        Description = $"Cliente '{client.FullName}' ({client.TbnCode}) suspendido automáticamente por deuda vencida >{dias} días.",
                        EntityId    = client.Id,
                        CreatedAt   = DateTime.UtcNow,
                    });

                    suspendedInBatch++;
                }
                catch (Exception ex)
                {
                    errors++;
                    // Sigue Activo, así que volvería a salir en el lote siguiente:
                    // se excluye para que el bucle avance y se reintente mañana.
                    skippedIds.Add(client.Id);
                    _logger.LogWarning(ex, "AutoSuspendClientJob: no se pudo suspender cliente {TbnCode}.", client.TbnCode);
                }
            }

            // Se persiste por lote: si algo falla más adelante, lo ya suspendido queda firme.
            if (suspendedInBatch > 0) await db.SaveChangesAsync(ct);
            suspended += suspendedInBatch;
        }

        if (rounds > MaxRoundsPerRun)
        {
            _logger.LogWarning(
                "AutoSuspendClientJob: se alcanzó el tope de {Max} lotes ({Size} c/u). " +
                "Quedan clientes sin evaluar; se retomarán en la próxima corrida.",
                MaxRoundsPerRun, SuspendBatchSize);
        }

        _logger.LogInformation(
            "AutoSuspendClientJob: {Suspended} suspendidos, {Skipped} omitidos por pago reciente, {Errors} errores.",
            suspended, skippedRecentPayer, errors);
    }
}
