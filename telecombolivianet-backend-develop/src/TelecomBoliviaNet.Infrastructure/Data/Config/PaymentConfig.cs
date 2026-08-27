using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="Payment"/>. Movido desde AppDbContext (F5.4).</summary>
public class PaymentConfig : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> e)
    {
            e.ToTable("Payments");
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.ClientId);
            e.HasIndex(p => p.PaidAt);
            e.HasIndex(p => p.RegisteredAt);
            e.HasIndex(p => new { p.IsVoided, p.PaidAt });
            e.Property(p => p.Amount).HasColumnType("decimal(10,2)");
            e.Property(p => p.Method).HasConversion<string>().HasMaxLength(30);
            e.Property(p => p.BankReference).HasMaxLength(100).IsRequired(false);

            e.Property(p => p.IsDeleted).HasDefaultValue(false).IsRequired();
            e.HasQueryFilter(p => !p.IsDeleted);

            e.HasOne(p => p.Client)
             .WithMany(c => c.Payments)
             .HasForeignKey(p => p.ClientId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(p => p.RegisteredBy)
             .WithMany()
             .HasForeignKey(p => p.RegisteredByUserId)
             .OnDelete(DeleteBehavior.Restrict);
        
    }
}
