using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Coverage;

public enum PortReservationStatus
{
    Active,     // reserva vigente (puerto retenido en la caja)
    Converted,  // la instalación se completó → el puerto pasó a ocupado
    Expired,    // TTL vencido sin completar → el puerto se liberó
    Cancelled,  // la instalación se canceló/no-realizó → el puerto se liberó
}

/// <summary>
/// Reserva con TTL de un puerto NAP para una instalación. Da integridad de
/// capacidad: el <c>SELECT … FOR UPDATE</c> del store serializa dos
/// agendamientos que compiten por el último puerto, y el
/// <c>ExpirePortReservationsJob</c> devuelve al pool los puertos de reservas
/// abandonadas (instalación agendada que nunca se completó).
/// </summary>
public class PortReservation : Entity
{
    public Guid                  DistributionBoxId { get; set; }
    public Guid                  InstallationId    { get; set; }
    public DateTime              ReservedAt        { get; set; } = DateTime.UtcNow;
    public DateTime              ExpiresAt         { get; set; }
    public PortReservationStatus Status            { get; set; } = PortReservationStatus.Active;
}
