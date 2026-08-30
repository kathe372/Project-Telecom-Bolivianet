using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="SupportTicket"/>. Movido desde AppDbContext (F5.4).</summary>
public class SupportTicketConfig : IEntityTypeConfiguration<SupportTicket>
{
    public void Configure(EntityTypeBuilder<SupportTicket> e)
    {
            e.ToTable("SupportTickets");
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.Status);
            e.HasIndex(t => t.Priority);
            e.HasIndex(t => t.ClientId);
            e.HasIndex(t => t.AssignedToUserId);
            e.HasIndex(t => new { t.Status, t.Priority });
            e.HasIndex(t => t.CreatedAt);
            e.HasIndex(t => t.ResolvedAt);
            e.HasQueryFilter(t => t.Client == null || !t.Client.IsDeleted);
            e.Property(t => t.Subject).HasMaxLength(200).IsRequired();
            e.Property(t => t.Type).HasConversion<string>().HasMaxLength(30);
            e.Property(t => t.Priority).HasConversion<string>().HasMaxLength(20);
            e.Property(t => t.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(t => t.Origin).HasConversion<string>().HasMaxLength(20);
            e.Property(t => t.Description).IsRequired();
            e.Property(t => t.SupportGroup).HasMaxLength(100).IsRequired(false);
            e.Property(t => t.ResolutionMessage).IsRequired(false);
            e.Property(t => t.RootCause).IsRequired(false);
            // D-26 — Ya existían en PostgreSQL (20260508000001_Phase2Improvements);
            // solo faltaba mapearlas. Por eso NO hay migración nueva.
            e.Property(t => t.CsatScore).IsRequired(false);
            e.Property(t => t.CsatRespondedAt).IsRequired(false);
            e.Property(t => t.SlaAlertSentAt).IsRequired(false);
            e.Property(t => t.SlaCompliant).IsRequired(false);
            e.Property(t => t.ProspectName).HasMaxLength(200).IsRequired(false);
            e.Property(t => t.ProspectPhone).HasMaxLength(30).IsRequired(false);
            e.Property(t => t.ProspectIdentityCard).HasMaxLength(30).IsRequired(false);
            e.Property(t => t.ProspectBackupPhone).HasMaxLength(30).IsRequired(false);
            e.HasOne(t => t.Client)
             .WithMany()
             .HasForeignKey(t => t.ClientId)
             .IsRequired(false)
             .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.AssignedTo)
             .WithMany()
             .HasForeignKey(t => t.AssignedToUserId)
             .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.CreatedBy)
             .WithMany()
             .HasForeignKey(t => t.CreatedByUserId)
             .OnDelete(DeleteBehavior.Restrict);
        
    }
}
