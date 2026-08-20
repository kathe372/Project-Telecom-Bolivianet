using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Tickets;

public enum VisitStatus { Programada, Completada, Cancelada }

public class TicketVisit : Entity
{
    public Guid           TicketId        { get; set; }
    public SupportTicket? Ticket          { get; set; }
    public DateTime       ScheduledAt     { get; set; }
    public Guid?          TechnicianId    { get; set; }
    public UserSystem?    Technician      { get; set; }
    public string?        Observations    { get; set; }
    public VisitStatus    Status          { get; set; } = VisitStatus.Programada;
    public int            DuracionMin     { get; set; } = 60;
    public Guid           CreatedByUserId { get; set; }
    public DateTime       CreatedAt       { get; set; } = DateTime.UtcNow;

    public ICollection<VisitTechnician> Technicians { get; set; }
        = new List<VisitTechnician>();
}
