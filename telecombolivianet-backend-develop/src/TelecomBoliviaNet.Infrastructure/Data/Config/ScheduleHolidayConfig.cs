using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="ScheduleHoliday"/>. Movido desde AppDbContext (F5.4).</summary>
public class ScheduleHolidayConfig : IEntityTypeConfiguration<ScheduleHoliday>
{
    public void Configure(EntityTypeBuilder<ScheduleHoliday> e)
    {
            e.ToTable("ScheduleHolidays");
            e.HasKey(h => h.Id);
            e.HasIndex(h => new { h.BusinessScheduleId, h.Date }).IsUnique();
            e.Property(h => h.Name).HasMaxLength(100).IsRequired();
            e.HasOne(h => h.BusinessSchedule)
             .WithMany(s => s.Holidays)
             .HasForeignKey(h => h.BusinessScheduleId)
             .OnDelete(DeleteBehavior.Cascade);
        
    }
}
