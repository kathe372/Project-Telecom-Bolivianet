using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="TicketNotification"/>. Movido desde AppDbContext (F5.4).</summary>
public class TicketNotificationConfig : IEntityTypeConfiguration<TicketNotification>
{
    public void Configure(EntityTypeBuilder<TicketNotification> e)
    {
            e.ToTable("TicketNotifications");
            e.HasKey(n => n.Id);
            e.Property(n => n.Type).HasConversion<string>().HasMaxLength(30);
            e.Property(n => n.Status).HasConversion<string>().HasMaxLength(10);
            e.Property(n => n.Recipient).HasMaxLength(200).IsRequired();
            e.Property(n => n.Message).IsRequired();
            e.Property(n => n.ErrorDetail).IsRequired(false);
            e.HasOne(n => n.Ticket)
             .WithMany(t => t.Notifications)
             .HasForeignKey(n => n.TicketId)
             .OnDelete(DeleteBehavior.Cascade);
        
    }
}
