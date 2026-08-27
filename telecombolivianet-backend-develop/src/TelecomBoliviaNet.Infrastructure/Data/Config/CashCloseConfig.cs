using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Payments;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="CashClose"/>. Movido desde AppDbContext (F5.4).</summary>
public class CashCloseConfig : IEntityTypeConfiguration<CashClose>
{
    public void Configure(EntityTypeBuilder<CashClose> e)
    {
            e.ToTable("CashCloses");
            e.HasKey(c => c.Id);

            // La columna se creó como jsonb (20260414000002_AddM2PaymentsAndBilling)
            // pero la propiedad es string: sin este mapeo Npgsql envía el parámetro
            // como text y PostgreSQL rechaza la escritura con
            // "42804: column DetailJson is of type jsonb but expression is of type text",
            // rompiendo el cierre de caja en producción.
            e.Property(c => c.DetailJson).HasColumnType("jsonb");

            // Tipos alineados con la migración 20260414000002 (el snapshot los tenía
            // como "numeric"/"text" genéricos, divergiendo de la tabla real).
            e.Property(c => c.TotalAmount).HasColumnType("numeric(18,2)");
            e.Property(c => c.PdfPath).HasMaxLength(500);

            e.HasIndex(c => new { c.UserId, c.ClosedAt });

            e.HasOne(c => c.User)
             .WithMany()
             .HasForeignKey(c => c.UserId)
             .OnDelete(DeleteBehavior.Restrict);
        
    }
}
