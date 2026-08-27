using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Auth;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="RefreshToken"/>. Movido desde AppDbContext (F5.4).</summary>
public class RefreshTokenConfig : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> e)
    {
            e.ToTable("RefreshTokens");
            e.HasKey(t => t.Id);
            e.Property(t => t.TokenHash).HasMaxLength(64).IsRequired();
            e.Property(t => t.CreatedByIp).HasMaxLength(50);
            e.Property(t => t.ReplacedByTokenHash).HasMaxLength(64);
            e.HasIndex(t => t.TokenHash).IsUnique();
            e.HasIndex(t => new { t.UserId, t.ExpiresAt });
        
    }
}
