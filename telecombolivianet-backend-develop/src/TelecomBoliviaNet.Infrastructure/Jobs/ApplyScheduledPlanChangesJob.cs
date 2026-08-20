using Microsoft.EntityFrameworkCore;
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

/// <summary>
/// Aplica los cambios de plan DIFERIDOS cuando llega su fecha efectiva.
///
/// La política comercial (<c>PlanChangePolicy</c>) es: upgrade inmediato, downgrade a fin de
/// mes. El ticket y la notificación decían "efectivo el 1ro del mes siguiente", pero al aprobar
/// se cambiaba el plan del cliente en el acto y NADA procesaba <c>EffectiveDate</c>: el cliente
/// perdía la velocidad contratada el mismo día, habiendo pagado el mes completo del plan
/// superior (auditoría 2026-08-06, BUG-12).
///
/// Ahora aprobar un cambio diferido lo deja en <see cref="PlanChangeStatus.Aprobado"/> y es
/// este job el que lo ejecuta y lo pasa a <see cref="PlanChangeStatus.Aplicado"/>.
/// </summary>
public class ApplyScheduledPlanChangesJob : BackgroundService
{
    /// <summary>00:30 UTC — poco después del cambio de día, antes de la facturación mensual
    /// (día 1 a las 00:00 hora Bolivia = 04:00 UTC), para que el mes nuevo ya se facture con el
    /// plan nuevo.</summary>
    private const int RunHourUtc   = 0;
    private const int RunMinuteUtc = 30;

    private readonly IServiceScopeFactory                  _scopeFactory;
    private readonly ILogger<ApplyScheduledPlanChangesJob> _logger;

    public ApplyScheduledPlanChangesJob(
        IServiceScopeFactory scopeFactory, ILogger<ApplyScheduledPlanChangesJob> logger)
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

                var lastRunDay = await JobRunTracker.ReadLastRunAsync(
                    db, SystemConfigKeys.PlanChangeLastRunDay, ct);

                // Con catch-up: si el contenedor estaba desplegando a la hora prevista, el
                // cambio se aplica en el primer tick disponible en vez de quedar colgado un mes.
                if (JobSchedule.ShouldRunDaily(DateTime.UtcNow, lastRunDay, RunHourUtc, RunMinuteUtc))
                {
                    await RunAsync(scope, db, ct);
                    await JobRunTracker.MarkRanAsync(
                        db, SystemConfigKeys.PlanChangeLastRunDay,
                        JobSchedule.DayKey(DateTime.UtcNow), ct);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ApplyScheduledPlanChangesJob: error en el ciclo de comprobación.");
            }

            try { await Task.Delay(TimeSpan.FromMinutes(5), ct); }
            catch (TaskCanceledException) { break; }
        }
    }

    /// <summary>
    /// Público para poder ejercitarlo en pruebas de integración sin esperar a la ventana horaria:
    /// la lógica de negocio del job no debe vivir escondida detrás de su temporizador.
    /// </summary>
    public async Task<int> RunAsync(IServiceScope scope, AppDbContext db, CancellationToken ct = default)
    {
        var now       = DateTime.UtcNow;
        var publisher = scope.ServiceProvider.GetRequiredService<INotifPublisher>();

        var pendientes = await db.PlanChangeRequests
            .Include(r => r.Client)
            .Include(r => r.NewPlan)
            .Where(r => r.Status == PlanChangeStatus.Aprobado && r.EffectiveDate <= now)
            .OrderBy(r => r.EffectiveDate)
            .ToListAsync(ct);

        if (pendientes.Count == 0) return 0;

        int aplicados = 0;

        foreach (var cambio in pendientes)
        {
            if (cambio.Client is null || cambio.NewPlan is null)
            {
                _logger.LogWarning(
                    "ApplyScheduledPlanChangesJob: solicitud {CambioId} sin cliente o plan — omitida.",
                    cambio.Id);
                continue;
            }

            try
            {
                // Si el cliente ya está en el plan destino (p. ej. otro cambio lo adelantó), solo
                // se cierra la solicitud: ChangePlan lanzaría DomainException por plan repetido.
                if (cambio.Client.PlanId != cambio.NewPlanId)
                {
                    cambio.Client.ChangePlan(cambio.NewPlanId);
                    aplicados++;
                }

                cambio.Status = PlanChangeStatus.Aplicado;

                db.AuditLogs.Add(new AuditLog
                {
                    UserName    = "Sistema",
                    Module      = "Clientes",
                    Action      = "PLAN_CHANGE_APPLIED",
                    Description = $"Cambio de plan aplicado en su fecha efectiva: " +
                                  $"{cambio.Client.TbnCode} → {cambio.NewPlan.Name} " +
                                  $"(efectivo {cambio.EffectiveDate:dd/MM/yyyy}).",
                    EntityId    = cambio.ClientId,
                    CreatedAt   = now,
                });

                await publisher.PublishAsync(
                    NotifType.CAMBIO_PLAN, cambio.ClientId, cambio.Client.PhoneMain,
                    new Dictionary<string, string>
                    {
                        ["nombre"]  = cambio.Client.FullName.Split(' ')[0],
                        ["plan"]    = cambio.NewPlan.Name,
                        ["empresa"] = "TelecomBoliviaNet",
                    });
            }
            catch (Exception ex)
            {
                // Una solicitud problemática no debe impedir que se apliquen las demás; queda
                // en Aprobado y se reintenta mañana.
                _logger.LogWarning(ex,
                    "ApplyScheduledPlanChangesJob: no se pudo aplicar la solicitud {CambioId}.",
                    cambio.Id);
            }
        }

        await db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "ApplyScheduledPlanChangesJob: {Aplicados} cambio(s) de plan aplicados de {Total} vencido(s).",
            aplicados, pendientes.Count);

        return aplicados;
    }
}
