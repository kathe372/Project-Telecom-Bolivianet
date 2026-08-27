using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Plans;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="Plan"/>. Movido desde AppDbContext (F5.4).</summary>
public class PlanConfig : IEntityTypeConfiguration<Plan>
{
    public void Configure(EntityTypeBuilder<Plan> e)
    {
            e.ToTable("Plans");
            e.HasKey(p => p.Id);
            e.Property(p => p.Name).HasMaxLength(100).IsRequired();
            e.Property(p => p.MonthlyPrice).HasColumnType("decimal(10,2)");
        
        e.HasData(
            new Plan { Id = Guid.Parse("00000000-0000-0000-0001-000000000001"), Name = "Plan Cobre", SpeedMb = 30, MonthlyPrice = 99.00m,  IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new Plan { Id = Guid.Parse("00000000-0000-0000-0001-000000000002"), Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149.00m, IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new Plan { Id = Guid.Parse("00000000-0000-0000-0001-000000000003"), Name = "Plan Oro",   SpeedMb = 80, MonthlyPrice = 199.00m, IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) }
        );;
    }
}
