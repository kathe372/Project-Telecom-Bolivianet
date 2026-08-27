using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="SlaPlan"/>. Movido desde AppDbContext (F5.4).</summary>
public class SlaPlanConfig : IEntityTypeConfiguration<SlaPlan>
{
    public void Configure(EntityTypeBuilder<SlaPlan> e)
    {
            e.ToTable("SlaPlans");
            e.HasKey(s => s.Id);
            e.HasIndex(s => s.Priority).IsUnique();
            e.Property(s => s.Name).HasMaxLength(100).IsRequired();
            e.Property(s => s.Priority).HasMaxLength(15).IsRequired();
            e.Property(s => s.Schedule).HasConversion<string>().HasMaxLength(20);
            e.HasOne(s => s.BusinessSchedule)
             .WithMany()
             .HasForeignKey(s => s.BusinessScheduleId)
             .IsRequired(false)
             .OnDelete(DeleteBehavior.Restrict);
        
        e.HasData(
            new SlaPlan { Id = Guid.Parse("00000000-0000-0000-0002-000000000001"), Name = "SLA Crítico", Priority = "Critica", FirstResponseMinutes = 15,  ResolutionMinutes = 240,  Schedule = SlaSchedule.Veinticuatro7, IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new SlaPlan { Id = Guid.Parse("00000000-0000-0000-0002-000000000002"), Name = "SLA Alto",    Priority = "Alta",    FirstResponseMinutes = 30,  ResolutionMinutes = 480,  Schedule = SlaSchedule.Veinticuatro7, IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new SlaPlan { Id = Guid.Parse("00000000-0000-0000-0002-000000000003"), Name = "SLA Medio",   Priority = "Media",   FirstResponseMinutes = 120, ResolutionMinutes = 1440, Schedule = SlaSchedule.Laboral,       IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new SlaPlan { Id = Guid.Parse("00000000-0000-0000-0002-000000000004"), Name = "SLA Bajo",    Priority = "Baja",    FirstResponseMinutes = 240, ResolutionMinutes = 4320, Schedule = SlaSchedule.Laboral,       IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) }
        );;
    }
}
