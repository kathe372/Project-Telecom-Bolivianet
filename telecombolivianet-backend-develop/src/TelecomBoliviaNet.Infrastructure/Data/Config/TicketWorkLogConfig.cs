using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="TicketWorkLog"/>. Movido desde AppDbContext (F5.4).</summary>
public class TicketWorkLogConfig : IEntityTypeConfiguration<TicketWorkLog>
{
    public void Configure(EntityTypeBuilder<TicketWorkLog> e)
    {
            e.ToTable("TicketWorkLogs");
            e.HasKey(w => w.Id);
            e.Property(w => w.Notes).IsRequired(false);
            e.HasOne(w => w.Ticket)
             .WithMany(t => t.WorkLogs)
             .HasForeignKey(w => w.TicketId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(w => w.User)
             .WithMany()
             .HasForeignKey(w => w.UserId)
             .OnDelete(DeleteBehavior.Restrict);
        
    }
}
