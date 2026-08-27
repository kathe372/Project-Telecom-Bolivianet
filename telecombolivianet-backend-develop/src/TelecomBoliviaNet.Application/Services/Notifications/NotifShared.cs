using System.Text.Json;
using TelecomBoliviaNet.Application.DTOs.Notifications;
using TelecomBoliviaNet.Application.Utils;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Services.Notifications;

public static class NotifShared
{
    /// <summary>Alias histórico de <see cref="BoliviaTime.Zone"/> — una sola definición de la zona.</summary>
    public static readonly TimeZoneInfo BoliviaZone = BoliviaTime.Zone;


    public static readonly IReadOnlyDictionary<string, string> VariableDescriptions =
        new Dictionary<string, string>
        {
            ["{{nombre}}"]               = "Primer nombre del cliente",
            ["{{apellido}}"]             = "Apellido del cliente",
            ["{{nombre_completo}}"]      = "Nombre completo del cliente",
            ["{{deuda}}"]                = "Deuda total pendiente en Bs.",
            ["{{monto}}"]                = "Monto de la factura o pago",
            ["{{periodo}}"]              = "Período de la factura (ej: Enero 2026)",
            ["{{fecha_vencimiento}}"]    = "Fecha de vencimiento de la factura",
            ["{{plan}}"]                 = "Nombre del plan del cliente",
            ["{{zona}}"]                 = "Zona del cliente",
            ["{{empresa}}"]              = "Nombre del ISP (SystemConfig)",
            ["{{dias_mora}}"]            = "Días de mora de la factura más antigua",
            ["{{meses_mora}}"]           = "Meses de mora",
            ["{{meses_pendientes}}"]     = "Cantidad de meses con facturas pendientes",
            ["{{fecha_corte}}"]          = "Fecha de corte configurada",
            ["{{num_ticket}}"]           = "Número correlativo del ticket (TK-AAAA-NNNN)",
            ["{{tecnico}}"]              = "Nombre del técnico asignado al ticket",
            ["{{fecha_visita}}"]         = "Fecha programada de visita técnica",
            ["{{meses_deuda_detalle}}"]  = "Lista detallada de meses adeudados con montos (ej: • Enero 2025 - Bs. 150.00)",
            ["{{qr_enlace}}"]            = "Enlace directo al QR de pago del cliente",
        };


    public static readonly IReadOnlyDictionary<NotifType, string> DefaultTextos =
        new Dictionary<NotifType, string>
        {
            [NotifType.RECORDATORIO_R1] =
                "Estimado/a {{nombre}},\n" +
                "Le saluda TelecomBoliviaNet, su proveedor de servicios de internet.\n\n" +
                "Le informamos que registra un saldo pendiente correspondiente a los siguientes períodos:\n\n" +
                "{{meses_deuda_detalle}}\n\n" +
                "Monto total a cancelar: Bs. {{deuda}}\n\n" +
                "Le solicitamos regularizar su pago a la brevedad posible para evitar la suspensión de su servicio.\n\n" +
                "Agradecemos su preferencia.\n" +
                "TelecomBoliviaNet",

            [NotifType.SUSPENSION] =
                "Estimado/a {{nombre}},\n" +
                "Le informamos que su servicio de internet con TelecomBoliviaNet ha sido *suspendido* por falta de pago.\n\n" +
                "Deuda pendiente: Bs. {{deuda}}\n\n" +
                "Para reactivar su servicio, comuníquese con nosotros.\n" +
                "TelecomBoliviaNet",

            [NotifType.REACTIVACION] =
                "Estimado/a {{nombre}},\n" +
                "Le informamos que su servicio de internet con TelecomBoliviaNet ha sido *reactivado* exitosamente.\n\n" +
                "Ya puede navegar con normalidad. Agradecemos su pago.\n" +
                "TelecomBoliviaNet",

            [NotifType.CONFIRMACION_PAGO] =
                "Estimado/a {{nombre}},\n" +
                "Le saluda TelecomBoliviaNet, su proveedor de servicios de internet.\n\n" +
                "Confirmamos la recepción de su pago por Bs. {{monto}}, correspondiente al/los período(s): {{periodo}}.\n\n" +
                "Su servicio se mantiene activo con normalidad. Agradecemos su puntualidad y la confianza depositada en nosotros.\n\n" +
                "Atentamente,\n" +
                "TelecomBoliviaNet 🙏",

            [NotifType.FACTURA_VENCIDA] =
                "Estimado/a {{nombre}},\n" +
                "Le informamos que registra facturas vencidas con TelecomBoliviaNet.\n\n" +
                "Detalle de períodos vencidos:\n\n" +
                "{{meses_deuda_detalle}}\n\n" +
                "Total vencido: Bs. {{deuda}}\n\n" +
                "Le solicitamos regularizar su pago a la brevedad posible para evitar la suspensión.\n" +
                "TelecomBoliviaNet",

            [NotifType.TICKET_CREADO] =
                "Estimado/a {{nombre}},\n" +
                "Su solicitud de soporte técnico con TelecomBoliviaNet ha sido registrada exitosamente.\n\n" +
                "Número de ticket: {{num_ticket}}\n\n" +
                "Le notificaremos cuando sea atendido. Gracias por su paciencia.\n" +
                "TelecomBoliviaNet",

            [NotifType.TICKET_ASIGNADO] =
                "Estimado/a {{nombre}},\n" +
                "Su ticket {{num_ticket}} ha sido asignado al técnico *{{tecnico}}*.\n\n" +
                "Fecha programada de visita: {{fecha_visita}}\n\n" +
                "Le estaremos esperando. Si necesita reagendar, comuníquese con nosotros.\n" +
                "TelecomBoliviaNet",

            [NotifType.TICKET_RESUELTO] =
                "Estimado/a {{nombre}},\n" +
                "Le informamos que su ticket {{num_ticket}} ha sido *resuelto*.\n\n" +
                "Si el inconveniente persiste, no dude en crear un nuevo ticket.\n" +
                "TelecomBoliviaNet",

            [NotifType.CAMBIO_PLAN] =
                "Estimado/a {{nombre}},\n" +
                "Le informamos que su plan de internet con TelecomBoliviaNet ha sido actualizado a *{{plan}}*.\n\n" +
                "El cambio ya se encuentra activo. Gracias por su preferencia.\n" +
                "TelecomBoliviaNet",

            [NotifType.CAMBIO_PRECIO] =
                "Estimado/a {{nombre}},\n" +
                "Le informamos que el precio de su plan *{{plan}}* ha sido actualizado a *Bs. {{precio_nuevo}}/mes*.\n\n" +
                "El nuevo precio se aplicará a partir de su próxima factura.\n" +
                "TelecomBoliviaNet",

            [NotifType.ALERTA_SLA] =
                "⚠️ *ALERTA SLA* — Ticket {{num_ticket}}\n" +
                "Cliente: {{cliente}}\n" +
                "Vence en: menos de {{horas}}h ({{vence}}){{sin_tecnico}}\n" +
                "Por favor atienda a la brevedad.",
        };


    public static NotifConfigDto ToConfigDto(NotifConfig c) => new(
        c.Tipo, c.Activo, c.DelaySegundos,
        c.HoraInicio.ToString("HH:mm"), c.HoraFin.ToString("HH:mm"),
        c.Inmediato, c.DiasAntes, c.PlantillaId);

    public static NotifTemplateDto ToPlantillaDto(NotifTemplate p) => new(
        p.Id, p.Tipo, p.Texto, p.Activa, p.Categoria, p.HsmStatus, p.CreadoAt,
        p.MetaTemplateName, p.MetaLanguageCode, p.MetaParamOrder);

    public static NotifSegmentDto ToSegmentDto(NotifSegment s, int? preview)
    {
        var reglas = string.IsNullOrEmpty(s.ReglasJson)
            ? new List<SegmentConditionGroup>()
            : JsonSerializer.Deserialize<List<SegmentConditionGroup>>(s.ReglasJson)
              ?? new List<SegmentConditionGroup>();
        return new NotifSegmentDto(s.Id, s.Nombre, s.Descripcion, reglas, s.CreadoAt, preview);
    }


    /// <summary>
    /// ¿Este cliente cumple la condición del segmento?
    ///
    /// <para>El instante se recibe en vez de leerse aquí: <c>dias_mora</c> depende
    /// de "ahora", y con el reloj dentro no había forma de probar el borde de un
    /// segmento sin esperar a que pasara el día.</para>
    /// </summary>
    public static bool EvaluaCondicion(
        Client c, List<Invoice> inv, SegmentCondition cond, DateTime now)
    {
        try
        {
            return cond.Campo switch
            {
                "zona"      => SegmentOperators.Compare(c.Zone,                        cond.Operador, cond.Valor),
                "plan"      => SegmentOperators.Compare(c.Plan?.Name ?? string.Empty, cond.Operador, cond.Valor),
                "estado"    => SegmentOperators.Compare(c.Status.ToString(),           cond.Operador, cond.Valor),
                // Saldo REAL pendiente, no el monto bruto: una factura de 200 con 150 abonados
                // aporta 50. Antes un segmento "deuda > 100" alcanzaba a ese cliente.
                "deuda"     => SegmentOperators.Compare(inv.Sum(i => i.Outstanding),  cond.Operador, decimal.Parse(cond.Valor)),
                "dias_mora" => SegmentOperators.Compare(
                    inv.Any() ? (decimal)(now - inv.Min(i => i.DueDate)).TotalDays : 0,
                    cond.Operador, decimal.Parse(cond.Valor)),
                _ => false
            };
        }
        // Regla de segmento mal formada (p. ej. valor no numérico en 'deuda'/'dias_mora')
        // → la condición no coincide. Se evalúa por cliente en bucle caliente, por lo que
        // el fallback a false es intencional y no se loguea aquí.
        catch { return false; }
    }
}
