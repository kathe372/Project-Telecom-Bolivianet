using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

public class VisitTechnicianConfig : IEntityTypeConfiguration<VisitTechnician>
{
    public void Configure(EntityTypeBuilder<VisitTechnician> b)
    {
        b.ToTable("VisitTechnicians");
        b.HasKey(x => x.Id);
        b.HasIndex(x => new { x.VisitId, x.TechnicianId }).IsUnique();
        b.HasOne(x => x.Visit)
         .WithMany(v => v.Technicians)
         .HasForeignKey(x => x.VisitId)
         .OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Technician)
         .WithMany()
         .HasForeignKey(x => x.TechnicianId)
         .OnDelete(DeleteBehavior.Restrict);
    }
}
