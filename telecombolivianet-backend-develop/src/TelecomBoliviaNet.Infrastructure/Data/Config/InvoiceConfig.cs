using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="Invoice"/>. Movido desde AppDbContext (F5.4).</summary>
public class InvoiceConfig : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> e)
    {
            e.ToTable("Invoices");
            e.HasKey(i => i.Id);
            e.HasIndex(i => new { i.ClientId, i.Year, i.Month, i.Type }).IsUnique();
            e.HasIndex(i => i.Status);
            e.HasIndex(i => new { i.ClientId, i.Status });
            e.HasIndex(i => i.DueDate);
            e.HasIndex(i => i.ClientId)
             .HasFilter("\"IsDeleted\" = false")
             .HasDatabaseName("IX_Invoices_ClientId_Active");
            e.Property(i => i.Amount).HasColumnType("decimal(10,2)");
            e.Property(i => i.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(i => i.Type).HasConversion<string>().HasMaxLength(20);

            e.Property(i => i.IsDeleted).HasDefaultValue(false).IsRequired();
            e.HasQueryFilter(i => !i.IsDeleted);

            // D-14: concurrencia optimista sobre la columna de sistema xmin, igual
            // que en Client. Sin esto, dos cobros simultáneos sobre la misma
            // factura se pisaban en silencio.
            e.Property(i => i.Xmin).IsRowVersion();

            e.HasOne(i => i.Client)
             .WithMany(c => c.Invoices)
             .HasForeignKey(i => i.ClientId)
             .OnDelete(DeleteBehavior.Cascade);
        
    }
}
