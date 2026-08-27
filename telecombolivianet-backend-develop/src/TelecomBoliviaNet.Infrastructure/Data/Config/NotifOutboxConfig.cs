using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Notifications;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="NotifOutbox"/>. Movido desde AppDbContext (F5.4).</summary>
public class NotifOutboxConfig : IEntityTypeConfiguration<NotifOutbox>
{
    public void Configure(EntityTypeBuilder<NotifOutbox> e)
    {
            e.ToTable("NotifOutbox");
            e.HasKey(o => o.Id);
            e.HasIndex(o => new { o.EstadoFinal, o.Publicado, o.EnviarDesde });
            e.HasIndex(o => o.ClienteId);
            e.HasIndex(o => new { o.Publicado, o.EstadoFinal })
             .HasFilter("\"Publicado\" = false AND \"EstadoFinal\" IS NULL")
             .HasDatabaseName("IX_NotifOutbox_Pending");
            e.Property(o => o.Tipo).HasConversion<string>().HasMaxLength(30);
            e.Property(o => o.EstadoFinal).HasConversion<string>().HasMaxLength(15).IsRequired(false);
            e.Property(o => o.PhoneNumber).HasMaxLength(30);
            e.Property(o => o.ContextoJson).HasColumnType("jsonb").HasDefaultValue("{}");
            e.HasOne(o => o.Cliente)
             .WithMany()
             .HasForeignKey(o => o.ClienteId)
             .OnDelete(DeleteBehavior.Restrict);
        
    }
}
