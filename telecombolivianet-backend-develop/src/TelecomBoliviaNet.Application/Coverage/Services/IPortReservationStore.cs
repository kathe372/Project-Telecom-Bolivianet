namespace TelecomBoliviaNet.Application.Coverage.Services;

/// <summary>
/// Puerta de persistencia ATÓMICA de reservas de puerto NAP. Vive detrás de esta
/// interfaz (DIP) porque el <c>SELECT … FOR UPDATE</c> y la transacción son
/// detalle de Infrastructure — la capa Application (BoxReservationService) solo
/// orquesta y nunca toca SQL ni transacciones (Clean Architecture).
/// </summary>
public interface IPortReservationStore
{
    /// <summary>
    /// Reserva atómicamente un puerto en la caja: bloquea la fila
    /// (<c>FOR UPDATE</c>), valida capacidad, incrementa reservados y crea la
    /// <c>PortReservation</c> con TTL. Devuelve el ZoneId de la caja si reservó,
    /// o null si no quedaban puertos (carrera perdida).
    /// </summary>
    Task<Guid?> TryReserveAsync(
        Guid boxId, Guid installationId, TimeSpan ttl, CancellationToken ct = default);

    /// <summary>
    /// Libera la reserva vigente de una instalación (cancelación/no-realizada):
    /// bloquea la caja, devuelve el puerto al pool y marca la reserva Cancelled.
    /// Idempotente y compatible con instalaciones legacy sin fila de reserva.
    /// </summary>
    Task ReleaseByInstallationAsync(Guid installationId, Guid boxId, CancellationToken ct = default);

    /// <summary>
    /// Expira las reservas Active vencidas (<c>ExpiresAt &lt; now</c>): libera el
    /// puerto de las abandonadas y las marca Expired; si la instalación ya se
    /// completó, solo las cierra como Converted (el puerto ya está ocupado).
    /// Devuelve cuántas se liberaron.
    /// </summary>
    Task<int> ExpireDueAsync(DateTime now, CancellationToken ct = default);
}
