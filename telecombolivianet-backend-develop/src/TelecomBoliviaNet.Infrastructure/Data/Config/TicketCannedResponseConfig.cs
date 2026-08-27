using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Entities.Auth;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="TicketCannedResponse"/>. Movido desde AppDbContext (F5.4).</summary>
public class TicketCannedResponseConfig : IEntityTypeConfiguration<TicketCannedResponse>
{
    public void Configure(EntityTypeBuilder<TicketCannedResponse> e)
    {
            e.ToTable("TicketCannedResponses");
            e.HasKey(r => r.Id);
            e.HasIndex(r => r.IsActive);
            e.Property(r => r.Title).HasMaxLength(200).IsRequired();
            e.Property(r => r.Body).IsRequired();
            e.Property(r => r.Category).HasMaxLength(100).IsRequired(false);
            e.Property(r => r.IsActive).HasDefaultValue(true);
            e.HasOne<TelecomBoliviaNet.Domain.Entities.Auth.UserSystem>()
             .WithMany()
             .HasForeignKey(r => r.CreatedByUserId)
             .OnDelete(DeleteBehavior.Restrict);
        
    }
}
