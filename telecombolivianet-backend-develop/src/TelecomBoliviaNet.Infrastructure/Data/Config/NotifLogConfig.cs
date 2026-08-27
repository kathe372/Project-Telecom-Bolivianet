using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Notifications;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="NotifLog"/>. Movido desde AppDbContext (F5.4).</summary>
public class NotifLogConfig : IEntityTypeConfiguration<NotifLog>
{
    public void Configure(EntityTypeBuilder<NotifLog> e)
    {
            e.ToTable("NotifLogs");
            e.HasKey(l => l.Id);
            e.HasIndex(l => new { l.ClienteId, l.RegistradoAt });
            e.HasIndex(l => new { l.ClienteId, l.Tipo, l.RegistradoAt });
            e.Property(l => l.Tipo).HasConversion<string>().HasMaxLength(30);
            e.Property(l => l.Estado).HasConversion<string>().HasMaxLength(15);
            e.Property(l => l.PhoneNumber).HasMaxLength(30);
            e.Property(l => l.Mensaje).IsRequired();
            e.Property(l => l.ErrorDetalle).IsRequired(false);
            e.HasOne(l => l.Cliente)
             .WithMany()
             .HasForeignKey(l => l.ClienteId)
             .OnDelete(DeleteBehavior.Restrict);
        
    }
}
