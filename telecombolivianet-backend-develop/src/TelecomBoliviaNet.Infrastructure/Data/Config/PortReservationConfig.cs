using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Coverage;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="PortReservation"/>. Movido desde AppDbContext (F5.4).</summary>
public class PortReservationConfig : IEntityTypeConfiguration<PortReservation>
{
    public void Configure(EntityTypeBuilder<PortReservation> e)
    {
            e.ToTable("PortReservations");
            e.HasKey(r => r.Id);
            e.Property(r => r.Status).HasConversion<string>().HasMaxLength(20);
            // El job de expiración barre por (Status, ExpiresAt); la liberación
            // busca la reserva vigente por instalación.
            e.HasIndex(r => new { r.Status, r.ExpiresAt });
            e.HasIndex(r => r.InstallationId);
            // Sin FK a DistributionBoxes/Installations: la reserva es un registro
            // de capacidad que sobrevive a borrados y no arrastra cascadas.
        
    }
}
