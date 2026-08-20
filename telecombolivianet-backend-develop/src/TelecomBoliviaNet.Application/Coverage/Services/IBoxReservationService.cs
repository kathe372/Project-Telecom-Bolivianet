using TelecomBoliviaNet.Domain.Entities.Installations;

namespace TelecomBoliviaNet.Application.Coverage.Services;

/// <summary>Reserva de puerto NAP asociada a una instalación.</summary>
public record BoxReservation(Guid BoxId, Guid ZoneId);

/// <summary>
/// Ciclo de vida del puerto NAP de una instalación (patrón work-order
/// comercial): se RESERVA al agendar, se LIBERA al cancelar o marcar
/// no-realizada, y se CONSUME (ocupa) al completar.
/// </summary>
public interface IBoxReservationService
{
    /// <summary>
    /// Reserva un puerto en la caja recomendada para las coordenadas, ligado a la
    /// instalación (para su TTL/liberación). La reserva es atómica (lock de fila).
    /// Devuelve null si no hay cobertura confirmada o no quedan puertos.
    /// </summary>
    Task<BoxReservation?> TryReserveAsync(
        double lat, double lng, Guid installationId, CancellationToken ct = default);

    /// <summary>
    /// Libera la reserva de la instalación (si tiene) y desvincula la caja.
    /// No toca puertos ocupados de instalaciones completadas.
    /// </summary>
    Task ReleaseAsync(Installation installation, CancellationToken ct = default);
}
