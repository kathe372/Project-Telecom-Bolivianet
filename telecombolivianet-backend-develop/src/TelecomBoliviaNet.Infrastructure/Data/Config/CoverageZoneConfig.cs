using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Coverage;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="CoverageZone"/>. Movido desde AppDbContext (F5.4).</summary>
public class CoverageZoneConfig : IEntityTypeConfiguration<CoverageZone>
{
    public void Configure(EntityTypeBuilder<CoverageZone> e)
    {
            e.ToTable("CoverageZones");
            e.HasKey(z => z.Id);
            e.HasIndex(z => z.Nombre).IsUnique();
            e.HasIndex(z => z.Estado);
            e.Property(z => z.Nombre).HasMaxLength(200).IsRequired();
            e.Property(z => z.Tecnologia).HasMaxLength(20).IsRequired();
            e.Property(z => z.Estado).HasConversion<string>().HasMaxLength(20);
            e.Property(z => z.Geom).HasColumnType("geometry(Polygon,4326)");
        
    }
}
