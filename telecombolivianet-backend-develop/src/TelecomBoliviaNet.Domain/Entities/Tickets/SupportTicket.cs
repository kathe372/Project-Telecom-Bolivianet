using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Tickets;

public enum TicketType
{
    SoporteTecnico, InstalacionNueva, CambioPlan,
    TvCable, ReactivacionServicio, BajaServicio, RecoleccionEquipo
}

public enum TicketPriority { Critica, Alta, Media, Baja }

public enum TicketStatus { Abierto, EnProceso, Resuelto, Cerrado, PendienteCliente, EnVisita }

public enum TicketOrigin { Bot, Manual, Automatico }

public class SupportTicket : Entity
{
    public Guid?          ClientId          { get; set; }
    public Client?        Client            { get; set; }

    public string?        ProspectName      { get; set; }
    public string?        ProspectPhone     { get; set; }
    public string?        ProspectIdentityCard { get; set; }
    public string?        ProspectBackupPhone  { get; set; }

    public string         Subject           { get; set; } = string.Empty;
    public TicketType     Type              { get; set; }
    public TicketPriority Priority          { get; set; }
    public TicketStatus   Status            { get; set; } = TicketStatus.Abierto;
    public TicketOrigin   Origin            { get; set; }
    public string         Description       { get; set; } = string.Empty;
    public string?        SupportGroup      { get; set; }

    public Guid?          AssignedToUserId  { get; set; }
    public UserSystem?    AssignedTo        { get; set; }
    public Guid           CreatedByUserId   { get; set; }
    public UserSystem?    CreatedBy         { get; set; }

    public DateTime       CreatedAt         { get; set; } = DateTime.UtcNow;
    public DateTime?      DueDate           { get; set; }
    public DateTime?      FirstRespondedAt  { get; set; }
    public DateTime?      ResolvedAt        { get; set; }
    public DateTime?      ClosedAt          { get; set; }

    public string?        ResolutionMessage { get; set; }
    public string?        RootCause         { get; set; }

    public DateTime?      SlaAlertSentAt        { get; set; }
    public bool?          SlaCompliant          { get; set; }

    public DateTime?      SlaPausedAt           { get; set; }
    public int            SlaTotalPausedMinutes { get; set; } = 0;

    public string?    TicketNumber     { get; set; }

    public DateTime?  SlaDeadline      { get; set; }

    public bool       AutoAssigned     { get; set; } = false;

    public string?    ImageUrl         { get; set; }

    public ICollection<TicketComment>      Comments { get; set; } = new List<TicketComment>();
    public ICollection<TicketWorkLog>      WorkLogs { get; set; } = new List<TicketWorkLog>();
    public ICollection<TicketVisit>        Visits   { get; set; } = new List<TicketVisit>();
    public ICollection<TicketNotification> Notifications { get; set; } = new List<TicketNotification>();
}
