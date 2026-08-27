using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="Client"/>. Movido desde AppDbContext (F5.4).</summary>
public class ClientConfig : IEntityTypeConfiguration<Client>
{
    public void Configure(EntityTypeBuilder<Client> e)
    {
            e.ToTable("Clients");
            e.HasKey(c => c.Id);
            e.HasIndex(c => c.TbnCode).IsUnique();
            e.HasIndex(c => c.IdentityCard).IsUnique();
            e.HasIndex(c => c.PhoneMain);
            e.Property(c => c.TbnCode).HasMaxLength(20).IsRequired();
            e.Property(c => c.FullName).HasMaxLength(150).IsRequired();
            e.Property(c => c.IdentityCard).HasMaxLength(20).IsRequired();
            e.Property(c => c.PhoneMain).HasMaxLength(20).IsRequired();
            e.Property(c => c.Zone).HasMaxLength(100).IsRequired();
            e.HasIndex(c => c.Zone);
            e.HasIndex(c => c.Status);
            e.Property(c => c.WinboxNumber).HasMaxLength(50).IsRequired();
            e.Property(c => c.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(c => c.GpsLatitude).HasColumnType("decimal(10,7)");
            e.Property(c => c.GpsLongitude).HasColumnType("decimal(10,7)");

            e.Property(c => c.IsDeleted).HasDefaultValue(false).IsRequired();
            e.HasIndex(c => c.IsDeleted);

            e.HasQueryFilter(c => !c.IsDeleted);

            e.HasOne(c => c.Plan)
             .WithMany()
             .HasForeignKey(c => c.PlanId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(c => c.InstalledBy)
             .WithMany()
             .HasForeignKey(c => c.InstalledByUserId)
             .OnDelete(DeleteBehavior.Restrict);

            e.Property(c => c.Xmin).IsRowVersion();
        
    }
}
