using TelecomBoliviaNet.Infrastructure.Data;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Coverage.Services;

namespace TelecomBoliviaNet.Infrastructure.Jobs;

/// <summary>
/// Mantiene fresco el read-model de puertos (<c>NapPort</c>): cada hora reconcilia
/// todas las cajas contra sus contadores + instalaciones + reservas vigentes. Los
/// endpoints de detalle también reconcilian su caja al vuelo, así que el job es la
/// red de seguridad para cambios que ocurrieron sin abrir la caja en el panel.
/// </summary>
public class NapPortSyncJob : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    private readonly IServiceScopeFactory       _scopeFactory;
    private readonly ILogger<NapPortSyncJob>    _logger;

    public NapPortSyncJob(IServiceScopeFactory scopeFactory, ILogger<NapPortSyncJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _logger.LogInformation("NapPortSyncJob iniciado.");

        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                // Reconciliar puertos es idempotente, pero que dos réplicas lo
                // hagan a la vez sobre las mismas cajas es trabajo tirado y ruido
                // en los contadores.
                await JobLease.TryRunExclusiveAsync(db, nameof(NapPortSyncJob), () =>
                    scope.ServiceProvider.GetRequiredService<INapPortService>().SyncAllAsync(ct), ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
            catch (Exception ex)
            {
                _logger.LogError(ex, "NapPortSyncJob: error al reconciliar puertos.");
            }

            await Task.Delay(Interval, ct);
        }
    }
}
