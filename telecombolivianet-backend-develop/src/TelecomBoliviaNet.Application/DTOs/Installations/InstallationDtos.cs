namespace TelecomBoliviaNet.Application.DTOs.Installations;


public record SlotDisponibleDto(
    string   Fecha,
    string   HoraInicio,
    string   HoraFin,
    int      Disponibles,
    bool     Disponible
);


public class CreateInstallationDto
{
    public Guid?    ClienteId      { get; set; }
    public Guid     PlanId         { get; set; }
    public string   Fecha          { get; set; } = string.Empty;
    public string   HoraInicio     { get; set; } = string.Empty;
    public string   Direccion      { get; set; } = string.Empty;
    public string?  Notas          { get; set; }
    public decimal? GpsLatitude    { get; set; }
    public decimal? GpsLongitude   { get; set; }
    public string?  LocationSource { get; set; }
    /// <summary>Identidad del prospecto; solo aplica cuando ClienteId es null.</summary>
    public string?  ProspectName   { get; set; }
    public string?  ProspectPhone  { get; set; }
    /// <summary>Obligatoria cuando ClienteId es null (ver CreateInstallationValidator).</summary>
    public string?  ProspectIdentityCard { get; set; }
    /// <summary>Contacto alterno del prospecto; solo aplica cuando ClienteId es null.
    /// Obligatorio cuando ClienteId es null (ver CreateInstallationValidator).</summary>
    public string?  ProspectBackupPhone  { get; set; }
}

public class CreateInstallationAdminDto
{
    public Guid    ClienteId   { get; set; }
    public Guid    PlanId      { get; set; }
    public string  Fecha       { get; set; } = string.Empty;
    public string  HoraInicio  { get; set; } = string.Empty;
    public int     DuracionMin { get; set; } = 120;
    public string  Direccion   { get; set; } = string.Empty;
    public string? Notas       { get; set; }
    public Guid?   TecnicoId   { get; set; }
}


public class CancelInstallationDto
{
    public string  MotivoCancelacion { get; set; } = string.Empty;
    public string  CanceladoPor      { get; set; } = "CLIENTE";
}


public class RescheduleInstallationDto
{
    public string  Fecha      { get; set; } = string.Empty;
    public string  HoraInicio { get; set; } = string.Empty;
    public string? Motivo     { get; set; }
    // Opcional: al redimensionar la cita en el calendario (arrastrar el borde)
    // cambia la duración. Si viene, se aplica antes de validar capacidad.
    public int?    DuracionMin { get; set; }
}


public class CompleteInstallationDto
{
    public string? NotasTecnico      { get; set; }
    public Guid?   DistributionBoxId { get; set; }
    // Evidencia de cierre (F5)
    public string?       EquipoOnuSerial { get; set; }
    public int?          MetrosDrop      { get; set; }
    public string?       ChecklistJson   { get; set; }
    public List<string>? FotosUrls       { get; set; }
}

public class AssignBoxDto
{
    public Guid DistributionBoxId { get; set; }
}

public class NoShowDto
{
    public string Motivo { get; set; } = string.Empty;
}


public class AssignTechnicianDto
{
    public Guid TecnicoId { get; set; }
}


public class AssignTechniciansDto
{
    public List<Guid> TecnicoIds    { get; set; } = new();
    public Guid       TecnicoLeadId { get; set; }
}


public record AssignedTechnicianDto(
    Guid     TechnicianId,
    string   TechnicianName,
    string?  Phone,
    bool     IsLead,
    DateTime AssignedAt
);


public record InstallationCreatedDto(
    string  InstalacionId,
    string  TicketId,
    string  Fecha,
    string  HoraInicio,
    string  Status,
    string? CalendarLink = null
);

public record InstallationDetailDto(
    Guid     Id,
    string   ClienteTbn,
    string   ClienteNombre,
    string   ClientePhone,
    string   PlanNombre,
    string   Fecha,
    string   HoraInicio,
    string   HoraFin,
    int      DuracionMin,
    string   Direccion,
    string?  Notas,
    string   Status,
    string?  TecnicoNombre,
    Guid?    TecnicoId,
    Guid?    TicketId,
    string?  MotivoCancelacion,
    string?  CanceladoPor,
    DateTime CreadoAt,
    decimal? GpsLatitude    = null,
    decimal? GpsLongitude   = null,
    string?  LocationSource = null,
    string?  MapsLink       = null,
    string?  CalendarLink   = null,
    List<AssignedTechnicianDto>? Tecnicos = null,
    Guid?    DistributionBoxId = null,
    string?  BoxCodigo         = null,
    Guid?    PlanId            = null
);

public record InstallationListItemDto(
    Guid    Id,
    string  ClienteTbn,
    string  ClienteNombre,
    string  PlanNombre,
    string  Fecha,
    string  HoraInicio,
    string  Status,
    string? TecnicoNombre,
    Guid?   TicketId,
    DateTime CreadoAt,
    string? BoxCodigo    = null,
    string? ClientePhone = null,
    // Campos adicionales para el calendario (aditivos, opcionales — ver PLAN_CALENDARIO.md).
    int?    DuracionMin  = null,
    Guid?   TecnicoId    = null
);


public class InstallationFilterDto
{
    public string?   Status         { get; set; }
    public string?   Fecha          { get; set; }
    public Guid?     TecnicoId      { get; set; }
    public Guid?     ClienteId      { get; set; }
    /// <summary>Solo prospectos con teléfono (pipeline de recontacto, F6).</summary>
    public bool?     SoloProspectos { get; set; }
    public int       Page           { get; set; } = 1;
    public int       PageSize       { get; set; } = 20;
}


public record AgendaItemDto(
    Guid    Id,
    string  Type,
    string  ClienteNombre,
    string  Fecha,
    string  HoraInicio,
    string  HoraFin,
    string  Direccion,
    string  Status,
    string? ClientePhone = null,
    string? PlanNombre   = null,
    string? Notas        = null,
    string? MapsLink     = null,
    Guid?   TecnicoId    = null,
    Guid?   TicketId     = null
);

public record TechnicianAgendaDto(
    Guid              TecnicoId,
    string            TecnicoNombre,
    string            Fecha,
    List<AgendaItemDto> Items
);
