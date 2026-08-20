using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Coverage;

public enum NapPortStatus
{
    Free,     // disponible
    Used,     // ocupado por un cliente instalado
    Reserved, // reservado por un agendamiento vigente
    Damaged,  // fuera de servicio (no cuenta para capacidad)
}

/// <summary>
/// Puerto individual de una caja NAP. Es un <b>read-model aditivo</b>: da
/// visibilidad "qué puerto usa qué cliente/ONU" y permite marcar puertos DAÑADOS.
/// La <b>verdad de capacidad</b> para el motor de cobertura sigue en los contadores
/// de <see cref="DistributionBox"/> (PuertosTotal/Ocupados/Reservados); estas filas
/// se reconcilian desde instalaciones + reservas vigentes. Marcar DAÑADO sí reduce
/// <c>PuertosTotal</c> (capacidad real).
/// </summary>
public class NapPort : Entity
{
    public Guid          DistributionBoxId { get; set; }
    public int           Numero            { get; set; }
    public NapPortStatus Status            { get; set; } = NapPortStatus.Free;
    /// <summary>Cliente que ocupa el puerto (null si libre/reservado-de-prospecto/dañado).</summary>
    public Guid?         AccountId         { get; set; }
    public string?       OnuSerial         { get; set; }
    /// <summary>Instalación asociada (la que reservó u ocupó el puerto).</summary>
    public Guid?         InstallationId    { get; set; }
    public DateTime      UpdatedAt         { get; set; } = DateTime.UtcNow;
}
