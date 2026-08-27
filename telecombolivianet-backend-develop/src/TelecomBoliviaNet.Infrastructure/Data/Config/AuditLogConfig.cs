using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Audit;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="AuditLog"/>. Movido desde AppDbContext (F5.4).</summary>
public class AuditLogConfig : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> e)
    {
            e.ToTable("AuditLogs");
            e.HasKey(a => a.Id);
            e.HasIndex(a => a.UserId);
            e.HasIndex(a => a.CreatedAt);
            e.HasIndex(a => a.Action);
            e.Property(a => a.Module).HasMaxLength(50);
            e.Property(a => a.Action).HasMaxLength(50);
            e.Property(a => a.UserAgent).HasMaxLength(512).IsRequired(false);
            e.Property(a => a.IntegrityHash).HasMaxLength(64).IsRequired(false);
        
    }
}
