using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Coverage.Services;

namespace TelecomBoliviaNet.Infrastructure.Jobs;

/// <summary>
/// Devuelve al pool los puertos NAP de reservas abandonadas: cada hora libera las
/// <c>PortReservation</c> Active cuyo TTL venció (instalación agendada que nunca
/// se completó). Sin este barrido, una reserva olvidada bloquearía el puerto para
/// siempre. Sigue el patrón de <c>QrExpiryAlertJob</c>/<c>AutoCloseTicketJob</c>.
/// </summary>
public class ExpirePortReservationsJob : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    private readonly IServiceScopeFactory                _scopeFactory;
    private readonly ILogger<ExpirePortReservationsJob>  _logger;

    public ExpirePortReservationsJob(
        IServiceScopeFactory                scopeFactory,
        ILogger<ExpirePortReservationsJob>  logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _logger.LogInformation("ExpirePortReservationsJob iniciado.");

        while (!ct.IsCancellationRequested)
        {
            await RunAsync(ct);
            await Task.Delay(Interval, ct);
        }
    }

    private async Task RunAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var store = scope.ServiceProvider.GetRequiredService<IPortReservationStore>();

            var freed = await store.ExpireDueAsync(DateTime.UtcNow, ct);
            if (freed > 0)
                _logger.LogInformation(
                    "ExpirePortReservationsJob: {Count} reserva(s) de puerto expiradas y liberadas.", freed);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Apagado normal del host.
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "ExpirePortReservationsJob: error al expirar reservas de puerto.");
        }
    }
}
