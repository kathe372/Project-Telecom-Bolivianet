using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="PaymentInvoice"/>. Movido desde AppDbContext (F5.4).</summary>
public class PaymentInvoiceConfig : IEntityTypeConfiguration<PaymentInvoice>
{
    public void Configure(EntityTypeBuilder<PaymentInvoice> e)
    {
            e.ToTable("PaymentInvoices");
            e.HasKey(pi => pi.Id);
            e.HasIndex(pi => new { pi.PaymentId, pi.InvoiceId }).IsUnique();
            e.Property(pi => pi.AmountApplied).HasColumnType("numeric(18,2)");

            e.HasOne(pi => pi.Payment)
             .WithMany(p => p.PaymentInvoices)
             .HasForeignKey(pi => pi.PaymentId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(pi => pi.Invoice)
             .WithMany(i => i.PaymentInvoices)
             .HasForeignKey(pi => pi.InvoiceId)
             .OnDelete(DeleteBehavior.Cascade);
        
    }
}
