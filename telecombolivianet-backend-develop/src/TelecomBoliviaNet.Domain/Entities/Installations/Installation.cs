using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Installations;

public enum InstallationStatus
{
    Pendiente,
    EnProceso,
    Completada,
    Cancelada,
    Reprogramada,
    /// <summary>Visita realizada pero no se pudo instalar (cliente ausente, etc.).</summary>
    NoRealizada,
}

public class Installation : Entity
{
    /// <summary>Null cuando la instalación es de un PROSPECTO aún no registrado como cliente.</summary>
    public Guid?    ClientId    { get; set; }
    public Client?  Client      { get; set; }

    /// <summary>Identidad del prospecto cuando ClientId es null (capturada por el bot de WhatsApp).</summary>
    public string?  ProspectName  { get; set; }
    public string?  ProspectPhone { get; set; }
    /// <summary>PASO 10: cédula de identidad del prospecto — obligatoria al agendar (ver CreateInstallationValidator).</summary>
    public string?  ProspectIdentityCard { get; set; }
    /// <summary>Contacto alterno del prospecto (no el WhatsApp desde el que escribe) para que el
    /// técnico pueda ubicarlo el día de la instalación si el WhatsApp principal no responde.</summary>
    public string?  ProspectBackupPhone  { get; set; }

    public Guid     PlanId      { get; set; }
    public Plan?    Plan        { get; set; }

    public DateTime Fecha       { get; set; }
    public TimeOnly HoraInicio  { get; set; }
    public int      DuracionMin { get; set; } = 120;

    public string   Direccion   { get; set; } = string.Empty;
    public string?  Notas       { get; set; }

    public InstallationStatus Status { get; set; } = InstallationStatus.Pendiente;

    public Guid?        TecnicoId { get; set; }
    public UserSystem?  Tecnico   { get; set; }

    public Guid?          TicketId { get; set; }
    public SupportTicket? Ticket   { get; set; }

    public string?  MotivoCancelacion { get; set; }
    public string?  CanceladoPor      { get; set; }

    public decimal? GpsLatitude       { get; set; }
    public decimal? GpsLongitude      { get; set; }
    public string?  LocationSource    { get; set; }
    public Guid?    CoverageZoneId    { get; set; }
    public Guid?    DistributionBoxId { get; set; }
    public DistributionBox? DistributionBox { get; set; }

    public DateTime? ReminderSentAt { get; set; }
    public DateTime? CanceladoAt    { get; set; }

    // ── Evidencia de cierre (F5 nivel comercial) ─────────────────────────────
    /// <summary>Serial de la ONU/router instalado.</summary>
    public string? EquipoOnuSerial { get; set; }
    /// <summary>Metros de cable drop utilizados.</summary>
    public int?    MetrosDrop      { get; set; }
    /// <summary>Checklist de cierre serializado como JSON {"item":true,...}.</summary>
    public string? ChecklistJson   { get; set; }
    /// <summary>URLs de fotos de la instalación, serializadas como JSON array.</summary>
    public string? FotosUrlsJson   { get; set; }

    public ICollection<InstallationTechnician> Technicians { get; set; }
        = new List<InstallationTechnician>();

    public DateTime  CreadoAt       { get; set; } = DateTime.UtcNow;
    public DateTime? ActualizadoAt  { get; set; }
    public Guid      CreadoPorId    { get; set; }
}
