using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Notifications;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="NotifConfig"/>. Movido desde AppDbContext (F5.4).</summary>
public class NotifConfigConfig : IEntityTypeConfiguration<NotifConfig>
{
    public void Configure(EntityTypeBuilder<NotifConfig> e)
    {
            e.ToTable("NotifConfigs");
            e.HasKey(c => c.Id);
            e.HasIndex(c => c.Tipo).IsUnique();
            e.Property(c => c.Tipo).HasConversion<string>().HasMaxLength(30);
            e.Property(c => c.HoraInicio).HasColumnType("time");
            e.Property(c => c.HoraFin).HasColumnType("time");
            e.Property(c => c.PlantillaId).IsRequired(false);
        
        e.HasData(
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000001"), Tipo = NotifType.SUSPENSION,        Activo = true, DelaySegundos = 0,    HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = null, ActualizadoAt = SeedValues.SeedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000002"), Tipo = NotifType.REACTIVACION,      Activo = true, DelaySegundos = 0,    HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = null, ActualizadoAt = SeedValues.SeedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000003"), Tipo = NotifType.RECORDATORIO_R1,   Activo = true,  DelaySegundos = 0, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = 5, ActualizadoAt = SeedValues.SeedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000004"), Tipo = NotifType.RECORDATORIO_R2,   Activo = false, DelaySegundos = 0, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = 3, ActualizadoAt = SeedValues.SeedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000005"), Tipo = NotifType.RECORDATORIO_R3,   Activo = false, DelaySegundos = 0, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = 1, ActualizadoAt = SeedValues.SeedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000006"), Tipo = NotifType.FACTURA_VENCIDA,   Activo = true, DelaySegundos = 3600, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = null, ActualizadoAt = SeedValues.SeedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000007"), Tipo = NotifType.CONFIRMACION_PAGO, Activo = true, DelaySegundos = 0,    HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = true,  DiasAntes = null, ActualizadoAt = SeedValues.SeedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000009"), Tipo = NotifType.TICKET_CREADO,    Activo = true, DelaySegundos = 0, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = null, ActualizadoAt = SeedValues.SeedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000010"), Tipo = NotifType.TICKET_RESUELTO,  Activo = true, DelaySegundos = 0, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = null, ActualizadoAt = SeedValues.SeedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000011"), Tipo = NotifType.CAMBIO_PLAN,      Activo = true, DelaySegundos = 0, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = null, ActualizadoAt = SeedValues.SeedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000012"), Tipo = NotifType.ALERTA_SLA,       Activo = true, DelaySegundos = 0, HoraInicio = new TimeOnly(7,0), HoraFin = new TimeOnly(22,0), Inmediato = true,  DiasAntes = null, ActualizadoAt = SeedValues.SeedDate }
        );;
    }
}
