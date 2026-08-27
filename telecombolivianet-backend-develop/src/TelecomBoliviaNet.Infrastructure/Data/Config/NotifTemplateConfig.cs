using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Notifications;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="NotifTemplate"/>. Movido desde AppDbContext (F5.4).</summary>
public class NotifTemplateConfig : IEntityTypeConfiguration<NotifTemplate>
{
    public void Configure(EntityTypeBuilder<NotifTemplate> e)
    {
            e.ToTable("NotifPlantillas");
            e.HasKey(p => p.Id);
            e.HasIndex(p => new { p.Tipo, p.Activa });
            e.Property(p => p.Tipo).HasConversion<string>().HasMaxLength(30);
            e.Property(p => p.Texto).IsRequired();
            e.Property(p => p.Categoria).HasConversion<string>().HasMaxLength(20);
            e.Property(p => p.HsmStatus).HasConversion<string>().HasMaxLength(15);
        
        e.HasData(
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000001"), Tipo = NotifType.SUSPENSION,        Activa = true, CreadoAt = SeedValues.SeedDate, CreadoPorId = SeedValues.AdminId, Texto = "Estimado/a {{nombre}},\n\nSu servicio *{{plan}}* ha sido *suspendido* por falta de pago.\nComuníquese con nosotros para regularizar su cuenta.\n\n*TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000002"), Tipo = NotifType.REACTIVACION,      Activa = true, CreadoAt = SeedValues.SeedDate, CreadoPorId = SeedValues.AdminId, Texto = "Estimado/a {{nombre}},\n\nSu servicio *{{plan}}* ha sido *reactivado* exitosamente. ¡Ya puede usarlo con normalidad!\n\n*TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000003"), Tipo = NotifType.RECORDATORIO_R1,   Activa = true, CreadoAt = SeedValues.SeedDate, CreadoPorId = SeedValues.AdminId, Texto = "Estimado/a {{nombre}},\n\nLe recordamos que tiene una factura de *Bs. {{monto}}* con vencimiento el *{{fecha_vencimiento}}* ({{meses_pendientes}} mes(es) pendiente(s)).\n\nEvite inconvenientes pagando antes del vencimiento.\n\n*TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000004"), Tipo = NotifType.RECORDATORIO_R2,   Activa = true, CreadoAt = SeedValues.SeedDate, CreadoPorId = SeedValues.AdminId, Texto = "Estimado/a {{nombre}},\n\n⚠️ Su factura de *Bs. {{monto}}* vence el *{{fecha_vencimiento}}*. Evite la suspensión del servicio pagando a tiempo.\n\n*TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000005"), Tipo = NotifType.RECORDATORIO_R3,   Activa = true, CreadoAt = SeedValues.SeedDate, CreadoPorId = SeedValues.AdminId, Texto = "Estimado/a {{nombre}},\n\n🚨 Su factura vence *mañana* ({{fecha_vencimiento}}). Monto: *Bs. {{monto}}*.\nRealice su pago hoy para no perder el servicio.\n\n*TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000006"), Tipo = NotifType.FACTURA_VENCIDA,   Activa = true, CreadoAt = SeedValues.SeedDate, CreadoPorId = SeedValues.AdminId, Texto = "Estimado/a {{nombre}},\n\nSu factura del periodo *{{periodo}}* por *Bs. {{monto}}* está *vencida*.\nPor favor regularice su pago para evitar la suspensión del servicio.\n\n*TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000007"), Tipo = NotifType.CONFIRMACION_PAGO, Activa = true, CreadoAt = SeedValues.SeedDate, CreadoPorId = SeedValues.AdminId, Texto = "Estimado/a {{nombre}},\n\n✅ Hemos registrado su pago de *Bs. {{monto}}* correspondiente al periodo *{{periodo}}*.\n\nGracias por su pago puntual. *TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000009"), Tipo = NotifType.TICKET_CREADO,   Activa = true, Categoria = TemplateCategory.Ticket, HsmStatus = HsmStatus.Aprobada, CreadoAt = SeedValues.SeedDate, CreadoPorId = SeedValues.AdminId, Texto = "Estimado/a {{nombre}},\n\nSu solicitud de soporte ha sido registrada con el número *{{num_ticket}}*.\n\nLe atenderemos a la brevedad. *{{empresa}}*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000010"), Tipo = NotifType.TICKET_RESUELTO, Activa = true, Categoria = TemplateCategory.Ticket, HsmStatus = HsmStatus.Aprobada, CreadoAt = SeedValues.SeedDate, CreadoPorId = SeedValues.AdminId, Texto = "Estimado/a {{nombre}},\n\nSu ticket *{{num_ticket}}* ha sido *resuelto* por {{tecnico}}.\n\nSi tiene alguna consulta adicional, contáctenos. *{{empresa}}*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000011"), Tipo = NotifType.CAMBIO_PLAN,     Activa = true, Categoria = TemplateCategory.Cobro,   HsmStatus = HsmStatus.Aprobada, CreadoAt = SeedValues.SeedDate, CreadoPorId = SeedValues.AdminId, Texto = "Estimado/a {{nombre}},\n\nSu plan de servicio ha sido actualizado a *{{plan}}*.\n\nEl cambio es efectivo inmediatamente. *{{empresa}}*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000012"), Tipo = NotifType.ALERTA_SLA,      Activa = true, Categoria = TemplateCategory.Tecnico, HsmStatus = HsmStatus.Pendiente, CreadoAt = SeedValues.SeedDate, CreadoPorId = SeedValues.AdminId, Texto = "⚠️ *ALERTA SLA* — Ticket {{num_ticket}}\nCliente: {{cliente}}\nVence en: menos de {{horas}}h ({{vence}}){{sin_tecnico}}\nPor favor atienda a la brevedad." }
        );;
    }
}
