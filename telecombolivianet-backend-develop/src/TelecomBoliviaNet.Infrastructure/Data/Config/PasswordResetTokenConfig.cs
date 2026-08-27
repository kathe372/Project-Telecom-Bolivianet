using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Auth;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="PasswordResetToken"/>. Movido desde AppDbContext (F5.4).</summary>
public class PasswordResetTokenConfig : IEntityTypeConfiguration<PasswordResetToken>
{
    public void Configure(EntityTypeBuilder<PasswordResetToken> e)
    {
            e.ToTable("PasswordResetTokens");
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.Token).IsUnique();
            e.Property(t => t.Token).HasMaxLength(100);
            e.Property(t => t.Channel).HasMaxLength(20);
        
    }
}
