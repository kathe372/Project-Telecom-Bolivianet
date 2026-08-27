using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="PlanChangeRequest"/>. Movido desde AppDbContext (F5.4).</summary>
public class PlanChangeRequestConfig : IEntityTypeConfiguration<PlanChangeRequest>
{
    public void Configure(EntityTypeBuilder<PlanChangeRequest> e)
    {
            e.ToTable("PlanChangeRequests");
            e.HasKey(r => r.Id);
            e.Property(r => r.Status).HasConversion<string>().HasMaxLength(15);
            e.HasIndex(r => new { r.ClientId, r.Status });
            e.HasOne(r => r.Client).WithMany().HasForeignKey(r => r.ClientId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(r => r.OldPlan).WithMany().HasForeignKey(r => r.OldPlanId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(r => r.NewPlan).WithMany().HasForeignKey(r => r.NewPlanId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(r => r.Ticket).WithMany().HasForeignKey(r => r.TicketId).OnDelete(DeleteBehavior.SetNull);
        
    }
}
