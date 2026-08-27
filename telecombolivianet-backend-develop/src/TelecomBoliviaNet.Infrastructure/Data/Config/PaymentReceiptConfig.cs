using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Payments;
using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="PaymentReceipt"/>. Movido desde AppDbContext (F5.4).</summary>
public class PaymentReceiptConfig : IEntityTypeConfiguration<PaymentReceipt>
{
    public void Configure(EntityTypeBuilder<PaymentReceipt> e)
    {
            e.ToTable("PaymentReceipts");
            e.HasOne(r => r.GeneratedBy)
             .WithMany()
             .HasForeignKey(r => r.GeneratedByUserId)
             .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(r => r.Client)
             .WithMany()
             .HasForeignKey(r => r.ClientId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(r => r.Payment)
             .WithMany()
             .HasForeignKey(r => r.PaymentId)
             .OnDelete(DeleteBehavior.Cascade);
        
    }
}
