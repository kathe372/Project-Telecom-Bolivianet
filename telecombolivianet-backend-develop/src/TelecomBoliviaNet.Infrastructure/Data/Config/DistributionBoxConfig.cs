using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Coverage;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="DistributionBox"/>. Movido desde AppDbContext (F5.4).</summary>
public class DistributionBoxConfig : IEntityTypeConfiguration<DistributionBox>
{
    public void Configure(EntityTypeBuilder<DistributionBox> e)
    {
            e.ToTable("DistributionBoxes");
            e.HasKey(b => b.Id);
            e.HasIndex(b => b.Codigo).IsUnique();
            e.HasIndex(b => b.ZoneId);
            e.HasIndex(b => b.Estado);
            e.Property(b => b.Codigo).HasMaxLength(50).IsRequired();
            e.Property(b => b.DireccionReferencia).HasMaxLength(300).IsRequired();
            e.Property(b => b.Estado).HasConversion<string>().HasMaxLength(20);
            e.Property(b => b.Location).HasColumnType("geometry(Point,4326)");
            e.HasOne(b => b.Zone)
             .WithMany()
             .HasForeignKey(b => b.ZoneId)
             .OnDelete(DeleteBehavior.Restrict);
        
    }
}
