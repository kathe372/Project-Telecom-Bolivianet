using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Plans;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="PlanHistory"/>. Movido desde AppDbContext (F5.4).</summary>
public class PlanHistoryConfig : IEntityTypeConfiguration<PlanHistory>
{
    public void Configure(EntityTypeBuilder<PlanHistory> e)
    {
            e.ToTable("PlanHistories");
            e.HasKey(h => h.Id);
            e.HasIndex(h => h.PlanId);
            e.HasIndex(h => h.ChangedAt);
            e.Property(h => h.Name).HasMaxLength(100).IsRequired();
            e.Property(h => h.MonthlyPrice).HasColumnType("decimal(10,2)");
            e.Property(h => h.ChangedByName).HasMaxLength(150).IsRequired();
            e.Property(h => h.ChangeReason).HasMaxLength(500);
            e.HasOne(h => h.Plan)
             .WithMany()
             .HasForeignKey(h => h.PlanId)
             .OnDelete(DeleteBehavior.Restrict);
        
    }
}
