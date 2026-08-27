using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Jobs;

public class BillingBackgroundJob : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<BillingBackgroundJob> _logger;

    public BillingBackgroundJob(
        IServiceProvider services,
        ILogger<BillingBackgroundJob> logger)
    {
        _services = services;
        _logger   = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("BillingBackgroundJob iniciado.");


        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var nowBolivia = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, NotifShared.BoliviaZone);
                var month    = nowBolivia.Month;
                var year     = nowBolivia.Year;
                var monthKey = JobSchedule.MonthKey(nowBolivia);

                // Un ÚNICO lease para las tres tareas del tick (generación,
                // recordatorios y vencimientos), no uno por bloque: así una sola
                // réplica se ocupa de todo el ciclo de facturación del minuto y no
                // pueden repartírselo dos.
                //
                // Es el job donde la exclusión más importa: sin ella, dos réplicas
                // leen el mismo "último mes facturado" y ambas generan las facturas
                // del mes. El índice único (ClientId, Year, Month, Type) evitaría el
                // desastre en la base, pero la segunda corrida abortaría a medias y
                // dejaría el crédito de los clientes ya descontado.
                using var leaseScope = _services.CreateScope();
                var leaseDb = leaseScope.ServiceProvider.GetRequiredService<AppDbContext>();

                var ejecuto = await JobLease.TryRunExclusiveAsync(
                    leaseDb, nameof(BillingBackgroundJob), async () =>
                {

                // GENERACIÓN mensual: día 1 a las 00:00, CON catch-up.
                //
                // Antes la condición era `day == 1 && hour == 0 && min entre 1 y 10`:
                // si el contenedor estaba desplegando o caído durante esos 10 minutos,
                // ese mes NO se facturaba a nadie y nada lo reintentaba, porque la
                // condición no se vuelve a cumplir hasta el mes siguiente.
                using (var scope = _services.CreateScope())
                {
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var lastGenerated = await JobRunTracker.ReadLastRunAsync(
                        db, SystemConfigKeys.BillingLastGeneratedMonth, stoppingToken);

                    if (JobSchedule.ShouldRunMonthly(nowBolivia, lastGenerated, dayOfMonth: 1, hour: 0))
                    {
                        _logger.LogInformation("Ejecutando job de GENERACIÓN {Month}/{Year}", month, year);
                        var billing = scope.ServiceProvider.GetRequiredService<BillingService>();
                        await billing.GenerateMonthlyInvoicesAsync(year, month);
                        await JobRunTracker.MarkRanAsync(
                            db, SystemConfigKeys.BillingLastGeneratedMonth, monthKey, stoppingToken);
                    }
                }

                // RECORDATORIOS: día 7 a las 09:00, con el mismo catch-up.
                using (var scopeR = _services.CreateScope())
                {
                    var db = scopeR.ServiceProvider.GetRequiredService<AppDbContext>();
                    var lastReminder = await JobRunTracker.ReadLastRunAsync(
                        db, SystemConfigKeys.BillingLastReminderMonth, stoppingToken);

                    if (JobSchedule.ShouldRunMonthly(nowBolivia, lastReminder, dayOfMonth: 7, hour: 9))
                    {
                        _logger.LogInformation("Ejecutando job de RECORDATORIOS {Month}/{Year}", month, year);
                        var reminderSvc = scopeR.ServiceProvider
                            .GetRequiredService<TelecomBoliviaNet.Application.Interfaces.IOverdueReminderService>();
                        await reminderSvc.SendOverdueRemindersAsync();
                        await JobRunTracker.MarkRanAsync(
                            db, SystemConfigKeys.BillingLastReminderMonth, monthKey, stoppingToken);
                    }
                }

                // Marcado de vencidas: DIARIO con catch-up.
                using (var scopeV = _services.CreateScope())
                {
                    var db = scopeV.ServiceProvider.GetRequiredService<AppDbContext>();
                    var lastOverdueDay = await JobRunTracker.ReadLastRunAsync(
                        db, SystemConfigKeys.BillingLastOverdueDay, stoppingToken);

                    if (BillingSchedule.ShouldRunOverdue(nowBolivia, lastOverdueDay))
                    {
                        var dayKey = BillingSchedule.DayKey(nowBolivia);
                        _logger.LogInformation("Ejecutando job de VENCIMIENTO {Day}", dayKey);
                        var statusSvc = scopeV.ServiceProvider
                            .GetRequiredService<TelecomBoliviaNet.Application.Interfaces.IInvoiceStatusService>();
                        await statusSvc.MarkOverdueInvoicesAsync();
                        await JobRunTracker.MarkRanAsync(
                            db, SystemConfigKeys.BillingLastOverdueDay, dayKey, stoppingToken);
                    }
                }

                }, stoppingToken);

                if (!ejecuto)
                    _logger.LogDebug("{Job}: otra instancia tiene el lease, se omite el tick.",
                                     nameof(BillingBackgroundJob));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en BillingBackgroundJob");
            }

            await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);
        }

        _logger.LogInformation("BillingBackgroundJob detenido.");
    }
}
