using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Admin;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="SystemConfig"/>. Movido desde AppDbContext (F5.4).</summary>
public class SystemConfigConfig : IEntityTypeConfiguration<SystemConfig>
{
    public void Configure(EntityTypeBuilder<SystemConfig> e)
    {
            e.ToTable("SystemConfigs");
            e.HasKey(c => c.Id);
            e.Property(c => c.Key).HasMaxLength(100).IsRequired();
            e.Property(c => c.Value).IsRequired();
            e.Property(c => c.IsSecret).HasDefaultValue(false);
            e.HasIndex(c => c.Key).IsUnique();
        
    }
}
