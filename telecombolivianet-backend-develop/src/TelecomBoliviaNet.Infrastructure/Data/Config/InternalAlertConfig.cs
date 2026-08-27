using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Alerts;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="InternalAlert"/>. Movido desde AppDbContext (F5.4).</summary>
public class InternalAlertConfig : IEntityTypeConfiguration<InternalAlert>
{
    public void Configure(EntityTypeBuilder<InternalAlert> e)
    {
            e.ToTable("InternalAlerts");
            e.HasKey(a => a.Id);
            e.Property(a => a.Type).HasMaxLength(50).IsRequired();
            e.Property(a => a.Title).HasMaxLength(200).IsRequired();
            e.Property(a => a.Message).HasMaxLength(500).IsRequired();
            e.Property(a => a.Link).HasMaxLength(300).IsRequired();
            e.Property(a => a.ForRole).HasMaxLength(30);
            e.Property(a => a.IsRead).HasDefaultValue(false);
            e.HasIndex(a => new { a.ForRole, a.IsRead });
            e.HasIndex(a => new { a.ForUserId, a.IsRead });
            e.HasIndex(a => a.CreatedAt);
        
    }
}
