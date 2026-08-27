using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="TicketVisit"/>. Movido desde AppDbContext (F5.4).</summary>
public class TicketVisitConfig : IEntityTypeConfiguration<TicketVisit>
{
    public void Configure(EntityTypeBuilder<TicketVisit> e)
    {
            e.ToTable("TicketVisits");
            e.HasKey(v => v.Id);
            e.Property(v => v.Observations).IsRequired(false);
            e.HasOne(v => v.Ticket)
             .WithMany(t => t.Visits)
             .HasForeignKey(v => v.TicketId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(v => v.Technician)
             .WithMany()
             .HasForeignKey(v => v.TechnicianId)
             .OnDelete(DeleteBehavior.Restrict);
        
    }
}
