using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Tickets;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="TicketComment"/>. Movido desde AppDbContext (F5.4).</summary>
public class TicketCommentConfig : IEntityTypeConfiguration<TicketComment>
{
    public void Configure(EntityTypeBuilder<TicketComment> e)
    {
            e.ToTable("TicketComments");
            e.HasKey(c => c.Id);
            e.Property(c => c.Type).HasConversion<string>().HasMaxLength(30);
            e.Property(c => c.Body).IsRequired();
            e.HasOne(c => c.Ticket)
             .WithMany(t => t.Comments)
             .HasForeignKey(c => c.TicketId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.Author)
             .WithMany()
             .HasForeignKey(c => c.AuthorId)
             .OnDelete(DeleteBehavior.Restrict);
        
    }
}
