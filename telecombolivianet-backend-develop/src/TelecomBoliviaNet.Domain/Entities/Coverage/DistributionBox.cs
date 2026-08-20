using NetTopologySuite.Geometries;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Coverage;

public enum DistributionBoxStatus
{
    Activo,
    Saturado,
    Mantenimiento,
}

public class DistributionBox : Entity
{
    public string                Codigo                  { get; set; } = string.Empty;
    public string                DireccionReferencia     { get; set; } = string.Empty;
    public Guid                  ZoneId                  { get; set; }
    public CoverageZone?         Zone                    { get; set; }
    public Point                 Location                { get; set; } = null!;
    public int                   PuertosTotal            { get; set; }
    public int                   PuertosOcupados         { get; set; }
    public int                   PuertosReservados       { get; set; }
    public int?                  DistanciaMaxCableMetros { get; set; }
    public DistributionBoxStatus Estado                  { get; set; } = DistributionBoxStatus.Activo;
    public DateTime              CreadoAt                { get; set; } = DateTime.UtcNow;

    public bool TienePuertosLibres()
        => PuertosTotal - PuertosOcupados - PuertosReservados > 0;

    public void Reservar()
    {
        if (!TienePuertosLibres())
            throw new DomainException("La caja de distribución no tiene puertos libres disponibles.");
        PuertosReservados++;
    }

    public void LiberarReserva()
    {
        if (PuertosReservados <= 0) return;
        PuertosReservados--;
    }

    public void LiberarPuertoOcupado()
    {
        if (PuertosOcupados <= 0) return;
        PuertosOcupados--;
        if (Estado == DistributionBoxStatus.Saturado && TienePuertosLibres())
            Estado = DistributionBoxStatus.Activo;
    }

    public void Ocupar()
    {
        // Con reserva previa la consume; sin reserva ocupa directamente un
        // puerto libre (el panel completa la instalación sin reservar antes).
        if (PuertosReservados > 0)
        {
            PuertosReservados--;
        }
        else if (!TienePuertosLibres())
        {
            throw new DomainException("La caja de distribución no tiene puertos libres disponibles.");
        }
        PuertosOcupados++;
    }

    /// <summary>
    /// Ocupa un puerto LIBRE sin consumir reservas: para cuando el técnico
    /// completa contra una caja distinta a la reservada — las reservas de
    /// otras instalaciones en esa caja no deben tocarse.
    /// </summary>
    public void OcuparPuertoLibre()
    {
        if (!TienePuertosLibres())
            throw new DomainException("La caja de distribución no tiene puertos libres disponibles.");
        PuertosOcupados++;
    }
}
