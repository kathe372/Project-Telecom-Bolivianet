using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Coverage;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="GeocodeCache"/>. Movido desde AppDbContext (F5.4).</summary>
public class GeocodeCacheConfig : IEntityTypeConfiguration<GeocodeCache>
{
    public void Configure(EntityTypeBuilder<GeocodeCache> e)
    {
            e.ToTable("GeocodeCaches");
            e.HasKey(g => g.Id);
            e.Property(g => g.NormalizedQuery).HasMaxLength(400).IsRequired();
            e.HasIndex(g => g.NormalizedQuery).IsUnique(); // clave de caché
            e.Property(g => g.DisplayName).HasMaxLength(500);
            e.Property(g => g.Location).HasColumnType("geometry(Point,4326)");
        
    }
}
