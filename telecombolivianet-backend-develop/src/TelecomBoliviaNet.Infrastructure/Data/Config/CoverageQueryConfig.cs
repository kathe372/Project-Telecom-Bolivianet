using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="CoverageQuery"/>. Movido desde AppDbContext (F5.4).</summary>
public class CoverageQueryConfig : IEntityTypeConfiguration<CoverageQuery>
{
    public void Configure(EntityTypeBuilder<CoverageQuery> e)
    {
            e.ToTable("CoverageQueries");
            e.HasKey(q => q.Id);
            e.HasIndex(q => q.QueriedAt);
            e.HasIndex(q => q.Result);
            e.Property(q => q.InputType).HasConversion<string>().HasMaxLength(20);
            e.Property(q => q.Channel).HasConversion<string>().HasMaxLength(20);
            e.Property(q => q.Result).HasMaxLength(40).IsRequired();
            e.Property(q => q.ZoneName).HasMaxLength(200);
            e.Property(q => q.ContactPhone).HasMaxLength(30);
            e.Property(q => q.ContactName).HasMaxLength(200);
            e.Property(q => q.Location).HasColumnType("geometry(Point,4326)");
            // MatchedBoxId es una referencia "suelta" (sin FK): el log persiste aunque
            // la caja se elimine después.
        
    }
}
