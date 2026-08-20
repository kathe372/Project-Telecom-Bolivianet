using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Clients;

public enum PlanChangeStatus
{
    Pendiente,
    /// <summary>
    /// Aprobado pero AÚN NO aplicado: el plan del cliente cambia recién en
    /// <see cref="PlanChangeRequest.EffectiveDate"/> (downgrades, que van a fin de mes).
    /// </summary>
    Aprobado,
    Rechazado,
    Cancelado,
    /// <summary>
    /// Ya ejecutado sobre el cliente. Antes no existía: aprobar un downgrade cambiaba el plan
    /// en el acto pese a que la política, el ticket y la notificación decían "efectivo el 1ro
    /// del mes siguiente" — el cliente perdía su velocidad habiendo pagado el mes completo.
    /// Sin este estado no había forma de distinguir lo aprobado de lo ya aplicado.
    /// </summary>
    Aplicado,
}

public class PlanChangeRequest : Entity
{
    public Guid     ClientId      { get; set; }
    public Client?  Client        { get; set; }

    public Guid     OldPlanId     { get; set; }
    public Plan?    OldPlan       { get; set; }

    public Guid     NewPlanId     { get; set; }
    public Plan?    NewPlan       { get; set; }

    public Guid?    TicketId      { get; set; }
    public SupportTicket? Ticket  { get; set; }

    public PlanChangeStatus Status { get; set; } = PlanChangeStatus.Pendiente;

    public DateTime EffectiveDate  { get; set; }

    public bool     MidMonthChange { get; set; } = false;

    public string?  RejectionReason { get; set; }
    public string?  Notes           { get; set; }

    public DateTime RequestedAt   { get; set; } = DateTime.UtcNow;
    public DateTime? ProcessedAt  { get; set; }
    public Guid     RequestedById { get; set; }
    public Guid?    ProcessedById { get; set; }
}
