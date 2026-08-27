using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Auth;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="UserSystem"/>. Movido desde AppDbContext (F5.4).</summary>
public class UserSystemConfig : IEntityTypeConfiguration<UserSystem>
{
    public void Configure(EntityTypeBuilder<UserSystem> e)
    {
            e.ToTable("UserSystems");
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.FullName).HasMaxLength(150).IsRequired();
            e.Property(u => u.Email).HasMaxLength(200).IsRequired();
            e.Property(u => u.PasswordHash).IsRequired();
            e.Property(u => u.Role).HasConversion<string>().HasMaxLength(30);
            e.Property(u => u.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(u => u.Phone).HasMaxLength(30);
            e.Property(u => u.IsDeleted).HasDefaultValue(false).IsRequired();
            e.HasIndex(u => u.IsDeleted);
            e.HasQueryFilter(u => !u.IsDeleted);
        
    }
}
