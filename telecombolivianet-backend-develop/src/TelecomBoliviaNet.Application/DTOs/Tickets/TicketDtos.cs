namespace TelecomBoliviaNet.Application.DTOs.Tickets;

public class TicketFilterDto
{
    public string?   Search       { get; set; }
    public string?   Status       { get; set; }
    public string?   Priority     { get; set; }
    public string?   Type         { get; set; }
    public Guid?     AssignedToId { get; set; }
    public bool?     OverdueSla   { get; set; }
    public DateTime? DateFrom     { get; set; }
    public DateTime? DateTo       { get; set; }
    public bool?     SlaCompliant { get; set; }
    public int       PageNumber   { get; set; } = 1;
    public int       PageSize     { get; set; } = 20;
}

public record TicketCommentDto(Guid Id, string Type, string Body, string AuthorName, Guid AuthorId, DateTime CreatedAt);
public record TicketWorkLogDto(Guid Id, string UserName, Guid UserId, int TotalMinutes, string? Notes, DateTime LoggedAt);
public record TicketVisitDto(Guid Id, DateTime ScheduledAt, string? TechnicianName, Guid? TechnicianId, string? Observations, DateTime CreatedAt, string Status = "Programada", string? TicketNumber = null);

public record TicketActivityDto(
    Guid     Id,
    string   Action,
    string   Description,
    string   UserName,
    Guid?    UserId,
    DateTime Timestamp);

public record CannedResponseDto(
    Guid     Id,
    string   Title,
    string   Body,
    string?  Category,
    bool     IsActive,
    DateTime CreatedAt);

public class CreateCannedResponseDto
{
    public string  Title    { get; set; } = string.Empty;
    public string  Body     { get; set; } = string.Empty;
    public string? Category { get; set; }
}

public class UpdateCannedResponseDto
{
    public string?  Title    { get; set; }
    public string?  Body     { get; set; }
    public string?  Category { get; set; }
    public bool?    IsActive { get; set; }
}

public record TicketListItemDto(
    Guid    Id, string ClientName, string ClientTbn, Guid? ClientId,
    string  Subject, string Type, string Priority, string Status, string Origin,
    string  Description, string? SupportGroup,
    string? AssignedToName, Guid? AssignedToId, string CreatedByName,
    DateTime CreatedAt, DateTime? DueDate, DateTime? ResolvedAt,
    DateTime? FirstRespondedAt, bool? SlaCompliant, int TotalWorkMinutes,
    string?   TicketNumber,
    DateTime? SlaDeadline,
    bool      AutoAssigned,
    // Próxima visita programada (Status = Programada, la más próxima en el tiempo).
    // Se muestra en lista/Kanban para no obligar a abrir el detalle a ver si hay
    // visita agendada y con qué técnico.
    DateTime? NextVisitAt              = null,
    string?   NextVisitTechnicianName  = null
);

public record TicketDetailDto(
    Guid    Id, string ClientName, string ClientTbn, Guid? ClientId,
    string  Subject, string Type, string Priority, string Status, string Origin,
    string  Description, string? SupportGroup,
    string? AssignedToName, Guid? AssignedToUserId,
    string  CreatedByName, Guid CreatedByUserId,
    DateTime CreatedAt, DateTime? DueDate, DateTime? ResolvedAt, DateTime? ClosedAt,
    DateTime? FirstRespondedAt, bool? SlaCompliant,
    string? ResolutionMessage, string? RootCause,
    int TotalWorkMinutes,
    IEnumerable<TicketCommentDto> Comments,
    IEnumerable<TicketWorkLogDto> WorkLogs,
    IEnumerable<TicketVisitDto>   Visits,
    int       SlaTotalPausedMinutes = 0,
    DateTime? SlaPausedAt           = null,
    string?   WhatsAppWarning       = null,
    string?   TicketNumber          = null,
    string?   ImageUrl              = null,
    decimal?  ClientGpsLatitude     = null,
    decimal?  ClientGpsLongitude    = null,
    string?   ClientZone            = null,
    string?   ClientStreet          = null,
    string?   ClientLocationRef     = null,
    string?   ClientPhone           = null,
    string?   ClientPlanName        = null,
    string?   ProspectIdentityCard  = null,
    string?   ProspectBackupPhone   = null,
    string?   InstallationBoxCode   = null,
    string?   InstallationZoneName  = null
);

public class CreateTicketDto
{
    public Guid?   ClientId         { get; set; }
    public string? ProspectName     { get; set; }
    public string? ProspectPhone    { get; set; }
    /// <summary>Obligatoria cuando ClientId es null (ver CreateTicketValidator).</summary>
    public string? ProspectIdentityCard { get; set; }
    public string  Subject          { get; set; } = string.Empty;
    public string  Type             { get; set; } = string.Empty;
    public string  Priority         { get; set; } = string.Empty;
    public string  Description      { get; set; } = string.Empty;
    public string? SupportGroup     { get; set; }
    public Guid?   AssignedToUserId { get; set; }
    public int?    SlaDurationHours { get; set; }
    public bool?   AutoAssign       { get; set; }
    public string? Origin           { get; set; }
    public string? ImageUrl         { get; set; }
}

public record TechnicianLoadDto(
    Guid   TecnicoId,
    string TecnicoNombre,
    int    TicketsActivos,
    int    TicketsCriticos
);

public record BalancingSummaryDto(List<TechnicianLoadDto> Tecnicos);

public record TicketTypesDto(string[] Types);


public class UpdateTicketDto
{
    public string? Subject      { get; set; }
    public string? Description  { get; set; }
    public string? Priority     { get; set; }
    public string? SupportGroup { get; set; }
    public string? RootCause    { get; set; }
}

public class ChangeTicketStatusDto
{
    public string  Status            { get; set; } = string.Empty;
    public string? ResolutionMessage { get; set; }
}

public class AssignTicketDto { public Guid TechnicianId { get; set; } }

public class AddCommentDto
{
    public string Type { get; set; } = "NotaInterna";
    public string Body { get; set; } = string.Empty;
}

public class AddWorkLogDto
{
    public int     Hours   { get; set; }
    public int     Minutes { get; set; }
    public string? Notes   { get; set; }
}

public class ScheduleVisitDto
{
    public DateTime ScheduledAt  { get; set; }
    public Guid?    TechnicianId { get; set; }
    public string?  Observations { get; set; }
}

// Reprogramación de la visita técnica de un ticket iniciada por el cliente
// (p. ej. vía chatbot WhatsApp). Fecha/Hora llegan como texto en hora local de
// Bolivia; el handler los combina y convierte a UTC.
public class RescheduleTicketVisitDto
{
    public string  Fecha  { get; set; } = string.Empty;  // YYYY-MM-DD (hora local Bolivia)
    public string  Hora   { get; set; } = string.Empty;  // HH:mm      (hora local Bolivia)
    public string? Motivo { get; set; }
}

public record SlaByPriorityDto(string Priority, int Compliant, int Breached);

public record TicketKpiDto(
    int TotalOpen, int TotalInProcess, int TotalResolved, int TotalClosed,
    int OverdueSla, int CreatedToday,
    int SlaCompliantCount, int SlaBreachedCount,
    IEnumerable<SlaByPriorityDto> SlaByPriority,
    double? AvgResolutionMinutes,
    double? AvgFirstResponseMinutes
);

public record SlaAlertItemDto(
    Guid      Id,
    string    TicketNumber,
    string    Subject,
    string    Priority,
    string    Status,
    string    ClientName,
    string?   AssignedToName,
    DateTime  CreatedAt,
    DateTime  DueDate,
    int       PctElapsed,
    string    Level
);

public record SlaAlertsDto(
    IEnumerable<SlaAlertItemDto> Breached,
    IEnumerable<SlaAlertItemDto> Warning,
    IEnumerable<SlaAlertItemDto> Attention
);

public class CreateSlaPlanDto
{
    public string Name                 { get; set; } = string.Empty;
    public string Priority             { get; set; } = string.Empty;
    public int    FirstResponseMinutes { get; set; }
    public int    ResolutionMinutes    { get; set; }
    public string Schedule             { get; set; } = "Veinticuatro7";
}

public class UpdateSlaPlanDto
{
    public string? Name                 { get; set; }
    public int?    FirstResponseMinutes { get; set; }
    public int?    ResolutionMinutes    { get; set; }
    public string? Schedule             { get; set; }
    public bool?   IsActive             { get; set; }
}

public record SlaPlanDto(
    Guid Id, string Name, string Priority,
    int FirstResponseMinutes, int ResolutionMinutes, string Schedule, bool IsActive
);

// PASO 16 Fase C: slot disponible para agendar una visita técnica de soporte.
// Mismo shape que SlotDisponibleDto (instalaciones) más WithinSla, que no aplica
// a instalaciones pero sí importa acá: el chatbot debe poder avisar si el slot
// elegido cae antes o después del vencimiento del SLA del ticket.
public record TicketSlotDto(
    string Fecha, string HoraInicio, string HoraFin,
    int Disponibles, bool Disponible, bool WithinSla
);
