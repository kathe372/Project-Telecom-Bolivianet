using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="CreditMovement"/>. Movido desde AppDbContext (F5.4).</summary>
public class CreditMovementConfig : IEntityTypeConfiguration<CreditMovement>
{
    public void Configure(EntityTypeBuilder<CreditMovement> e)
    {
            e.ToTable("CreditMovements");
            e.HasKey(m => m.Id);
            e.HasIndex(m => new { m.ClientId, m.CreatedAt });

            e.Property(m => m.Amount).HasColumnType("numeric(18,2)");
            e.Property(m => m.BalanceAfter).HasColumnType("numeric(18,2)");
            e.Property(m => m.Type).HasConversion<string>().HasMaxLength(30);
            e.Property(m => m.Notes).HasMaxLength(500);

            e.HasOne(m => m.Client)
             .WithMany()
             .HasForeignKey(m => m.ClientId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(m => m.CreatedBy)
             .WithMany()
             .HasForeignKey(m => m.CreatedByUserId)
             .OnDelete(DeleteBehavior.SetNull);
        
    }
}
