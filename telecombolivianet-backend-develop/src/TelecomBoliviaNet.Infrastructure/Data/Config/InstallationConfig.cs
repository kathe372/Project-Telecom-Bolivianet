using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="Installation"/>. Movido desde AppDbContext (F5.4).</summary>
public class InstallationConfig : IEntityTypeConfiguration<Installation>
{
    public void Configure(EntityTypeBuilder<Installation> e)
    {
            e.ToTable("Installations");
            e.HasKey(i => i.Id);
            e.Property(i => i.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(i => i.Direccion).HasMaxLength(300).IsRequired();
            e.Property(i => i.CanceladoPor).HasMaxLength(10).IsRequired(false);
            e.Property(i => i.HoraInicio).HasColumnType("time without time zone");
            e.Property(i => i.GpsLatitude).HasColumnType("decimal(10,7)").IsRequired(false);
            e.Property(i => i.GpsLongitude).HasColumnType("decimal(10,7)").IsRequired(false);
            e.Property(i => i.LocationSource).HasMaxLength(30).IsRequired(false);
            e.Property(i => i.ProspectName).HasMaxLength(200).IsRequired(false);
            e.Property(i => i.ProspectPhone).HasMaxLength(30).IsRequired(false);
            e.Property(i => i.ProspectIdentityCard).HasMaxLength(30).IsRequired(false);
            e.Property(i => i.ProspectBackupPhone).HasMaxLength(30).IsRequired(false);
            e.Property(i => i.EquipoOnuSerial).HasMaxLength(100).IsRequired(false);
            e.Property(i => i.ChecklistJson).IsRequired(false);
            e.Property(i => i.FotosUrlsJson).IsRequired(false);
            e.HasIndex(i => new { i.Fecha, i.HoraInicio });
            e.HasIndex(i => i.Status);
            e.HasIndex(i => i.ClientId);
            e.HasOne(i => i.Client).WithMany().HasForeignKey(i => i.ClientId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(i => i.Plan).WithMany().HasForeignKey(i => i.PlanId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(i => i.Tecnico).WithMany().HasForeignKey(i => i.TecnicoId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(i => i.Ticket).WithMany().HasForeignKey(i => i.TicketId).OnDelete(DeleteBehavior.SetNull);
        
    }
}
