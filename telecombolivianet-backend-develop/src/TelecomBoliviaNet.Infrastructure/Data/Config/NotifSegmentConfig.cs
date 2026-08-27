using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Notifications;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="NotifSegment"/>. Movido desde AppDbContext (F5.4).</summary>
public class NotifSegmentConfig : IEntityTypeConfiguration<NotifSegment>
{
    public void Configure(EntityTypeBuilder<NotifSegment> e)
    {
            e.ToTable("NotifSegments");
            e.HasKey(s => s.Id);
            e.HasIndex(s => s.Nombre).IsUnique();
            e.Property(s => s.Nombre).HasMaxLength(100).IsRequired();
            e.Property(s => s.Descripcion).HasMaxLength(500);
            e.Property(s => s.ReglasJson).HasColumnType("jsonb").HasDefaultValue("[]");
        
    }
}
