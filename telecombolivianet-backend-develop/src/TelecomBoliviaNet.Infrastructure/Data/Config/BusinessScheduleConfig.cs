using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="BusinessSchedule"/>. Movido desde AppDbContext (F5.4).</summary>
public class BusinessScheduleConfig : IEntityTypeConfiguration<BusinessSchedule>
{
    public void Configure(EntityTypeBuilder<BusinessSchedule> e)
    {
            e.ToTable("BusinessSchedules");
            e.HasKey(s => s.Id);
            e.HasIndex(s => s.IsDefault);
            e.HasIndex(s => s.IsActive);
            e.Property(s => s.Name).HasMaxLength(100).IsRequired();
            e.Property(s => s.TimeZoneName).HasMaxLength(50).IsRequired();
            e.Property(s => s.UpdatedAt).IsRequired(false);
        
        e.HasData(new
        {
            Id              = Guid.Parse("00000000-0000-0000-0007-000000000001"),
            Name            = "Horario Laboral Bolivia",
            TimeZoneName    = "America/La_Paz",
            UtcOffsetHours  = -4,
            WorkingDaysMask = 31,
            StartHour       = 8,
            EndHour         = 18,
            Is24x7          = false,
            IsDefault       = true,
            IsActive        = true,
            CreatedAt       = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            UpdatedAt       = (DateTime?)null,
        });;
    }
}
