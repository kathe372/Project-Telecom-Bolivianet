using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Notifications;

public enum NotifType
{
    SUSPENSION,
    REACTIVACION,
    RECORDATORIO_R1,
    RECORDATORIO_R2,
    RECORDATORIO_R3,
    FACTURA_VENCIDA,
    CONFIRMACION_PAGO,
    TICKET_ASIGNADO,
    TICKET_CREADO,
    TICKET_RESUELTO,
    CAMBIO_PLAN,
    CAMBIO_PRECIO,
    QR_COMPANY_EXPIRA,
    ALERTA_SLA,
    VISITA_PROGRAMADA,
    INSTALACION_ASIGNADA,
    RECORDATORIO_INSTALACION,
    TICKET_EN_PROCESO,

    /// <summary>
    /// Rechazo de solicitud de cambio de plan. Antes se reutilizaba CAMBIO_PLAN,
    /// con lo que el cliente recibía "tu plan cambió a X" justo cuando se le
    /// acababa de denegar ese cambio.
    /// </summary>
    CAMBIO_PLAN_RECHAZADO,

    /// <summary>
    /// Anulación de un pago registrado. Antes se reutilizaba CONFIRMACION_PAGO
    /// metiendo "Pago anulado…" en la variable {{periodo}}, lo que producía un
    /// mensaje incoherente ("Confirmamos tu pago de Bs X correspondiente a
    /// Pago anulado — sus facturas vuelven a estar pendientes").
    /// </summary>
    PAGO_ANULADO
}

public class NotifConfig : Entity
{
    public NotifType  Tipo            { get; set; }
    public bool       Activo          { get; set; } = true;
    public int        DelaySegundos   { get; set; } = 0;
    public TimeOnly   HoraInicio      { get; set; } = new TimeOnly(8, 0);
    public TimeOnly   HoraFin         { get; set; } = new TimeOnly(20, 0);
    public bool       Inmediato       { get; set; } = false;
    public int?       DiasAntes       { get; set; }
    public Guid?      PlantillaId     { get; set; }
    public DateTime   ActualizadoAt   { get; set; } = DateTime.UtcNow;
    public Guid?      ActualizadoPorId { get; set; }
}
