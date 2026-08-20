using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.Infrastructure.Jobs;

/// <summary>
/// Auditoría 2026-08-01 — Fase 2b.
///
/// Purga diaria de los tokens caducados. Hasta ahora NADA limpiaba estas tablas:
///
/// - <c>TokenBlacklists</c> crecía sin límite y se consultaba en cada petición
///   autenticada — la búsqueda por el JWT completo se degradaba con el tiempo.
/// - <c>RefreshTokens</c> crecía aún más rápido (la rotación crea una fila por
///   refresh y solo marca la anterior como revocada). Existía
///   <c>RefreshTokenService.PurgeExpiredAsync</c>, pero nadie lo llamaba.
///
/// Borrar filas con <c>ExpiresAt</c> vencido es seguro por definición: un token
/// caducado ya no puede usarse, esté o no en la lista.
/// </summary>
public class TokenCleanupJob : BackgroundService
{
    private readonly IServiceScopeFactory      _scopeFactory;
    private readonly ILogger<TokenCleanupJob>  _logger;

    /// <summary>03:00 UTC — fuera del horario laboral boliviano (UTC−4 → 23:00).</summary>
    private const int RunHourUtc = 3;

    public TokenCleanupJob(IServiceScopeFactory scopeFactory, ILogger<TokenCleanupJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                // La lectura del tracker va DENTRO del lease: si se dejara fuera,
                // dos réplicas leerían "lastRun=ayer" antes de que ninguna tomara
                // el lock y no se habría arreglado nada.
                var ejecuto = await JobLease.TryRunExclusiveAsync(db, nameof(TokenCleanupJob), async () =>
                {
                    var lastRunDay = await JobRunTracker.ReadLastRunAsync(
                        db, SystemConfigKeys.TokenCleanupLastRunDay, ct);

                    if (!JobSchedule.ShouldRunDaily(DateTime.UtcNow, lastRunDay, RunHourUtc)) return;

                    await RunAsync(scope, db, ct);
                    await JobRunTracker.MarkRanAsync(
                        db, SystemConfigKeys.TokenCleanupLastRunDay,
                        JobSchedule.DayKey(DateTime.UtcNow), ct);
                }, ct);

                if (!ejecuto)
                    _logger.LogDebug("{Job}: otra instancia tiene el lease, se omite el tick.",
                                     nameof(TokenCleanupJob));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "TokenCleanupJob: error en el ciclo de comprobación.");
            }

            try { await Task.Delay(TimeSpan.FromMinutes(5), ct); }
            catch (TaskCanceledException) { break; }
        }
    }

    private async Task RunAsync(IServiceScope scope, AppDbContext db, CancellationToken ct)
    {
        var now = DateTime.UtcNow;

        // ExecuteDeleteAsync borra en SQL sin materializar las filas.
        var blacklistPurged = await db.TokenBlacklists
            .Where(t => t.ExpiresAt < now)
            .ExecuteDeleteAsync(ct);

        var refreshSvc     = scope.ServiceProvider.GetRequiredService<RefreshTokenService>();
        var refreshPurged  = await refreshSvc.PurgeExpiredAsync();

        _logger.LogInformation(
            "TokenCleanupJob: {Blacklist} tokens de lista negra y {Refresh} refresh tokens caducados eliminados.",
            blacklistPurged, refreshPurged);
    }
}
