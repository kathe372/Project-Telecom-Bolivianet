using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Installations;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

public class InstallationTechnicianConfig : IEntityTypeConfiguration<InstallationTechnician>
{
    public void Configure(EntityTypeBuilder<InstallationTechnician> b)
    {
        b.ToTable("InstallationTechnicians");
        b.HasKey(x => x.Id);
        b.HasIndex(x => new { x.InstallationId, x.TechnicianId }).IsUnique();
        b.HasOne(x => x.Installation)
         .WithMany(i => i.Technicians)
         .HasForeignKey(x => x.InstallationId)
         .OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Technician)
         .WithMany()
         .HasForeignKey(x => x.TechnicianId)
         .OnDelete(DeleteBehavior.Restrict);
    }
}
