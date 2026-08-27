using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Coverage;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="NapPort"/>. Movido desde AppDbContext (F5.4).</summary>
public class NapPortConfig : IEntityTypeConfiguration<NapPort>
{
    public void Configure(EntityTypeBuilder<NapPort> e)
    {
            e.ToTable("NapPorts");
            e.HasKey(p => p.Id);
            e.Property(p => p.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(p => p.OnuSerial).HasMaxLength(100);
            e.HasIndex(p => new { p.DistributionBoxId, p.Numero }).IsUnique();
            e.HasIndex(p => p.Status);
            // FK con cascada: borrar la caja limpia sus puertos automáticamente.
            e.HasOne<DistributionBox>()
             .WithMany()
             .HasForeignKey(p => p.DistributionBoxId)
             .OnDelete(DeleteBehavior.Cascade);
        
    }
}
