using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Payments;
using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="WhatsAppReceipt"/>. Movido desde AppDbContext (F5.4).</summary>
public class WhatsAppReceiptConfig : IEntityTypeConfiguration<WhatsAppReceipt>
{
    public void Configure(EntityTypeBuilder<WhatsAppReceipt> e)
    {
            e.ToTable("WhatsAppReceipts");
            e.HasKey(r => r.Id);
            e.Property(r => r.Status).HasConversion<string>().HasMaxLength(20);
            e.HasIndex(r => r.Status);
            e.HasIndex(r => r.ReceivedAt);
            e.HasOne(r => r.Client)
             .WithMany()
             .HasForeignKey(r => r.ClientId)
             .IsRequired(false)
             .OnDelete(DeleteBehavior.Restrict);
        
    }
}
