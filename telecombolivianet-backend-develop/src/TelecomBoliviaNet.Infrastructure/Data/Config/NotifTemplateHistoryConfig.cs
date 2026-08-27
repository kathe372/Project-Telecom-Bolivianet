using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Notifications;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="NotifTemplateHistory"/>. Movido desde AppDbContext (F5.4).</summary>
public class NotifTemplateHistoryConfig : IEntityTypeConfiguration<NotifTemplateHistory>
{
    public void Configure(EntityTypeBuilder<NotifTemplateHistory> e)
    {
            e.ToTable("NotifPlantillaHistorial");
            e.HasKey(h => h.Id);
            e.Property(h => h.Tipo).HasConversion<string>().HasMaxLength(30);
            e.Property(h => h.Texto).IsRequired();
        
    }
}
