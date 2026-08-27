using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Auth;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="TokenBlacklist"/>. Movido desde AppDbContext (F5.4).</summary>
public class TokenBlacklistConfig : IEntityTypeConfiguration<TokenBlacklist>
{
    public void Configure(EntityTypeBuilder<TokenBlacklist> e)
    {
            e.ToTable("TokenBlacklists");
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.Token);
            e.HasIndex(t => t.ExpiresAt);
        
    }
}
