using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Auth;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="EmailActivationToken"/>. Movido desde AppDbContext (F5.4).</summary>
public class EmailActivationTokenConfig : IEntityTypeConfiguration<EmailActivationToken>
{
    public void Configure(EntityTypeBuilder<EmailActivationToken> e)
    {
            e.ToTable("EmailActivationTokens");
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.Token).IsUnique();
            e.HasIndex(t => t.UserId);
            e.Property(t => t.Token).HasMaxLength(64).IsRequired();
        
    }
}
