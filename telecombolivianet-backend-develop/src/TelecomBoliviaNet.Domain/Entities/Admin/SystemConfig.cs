using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Admin;

public class SystemConfig : Entity
{
    public string Key       { get; set; } = string.Empty;

    public string Value     { get; set; } = string.Empty;

    public string? Description { get; set; }

    public bool   IsSecret  { get; set; } = false;

    public DateTime UpdatedAt  { get; set; } = DateTime.UtcNow;
    public Guid?    UpdatedById { get; set; }
}

public static class SystemConfigKeys
{
    public const string WhatsAppToken          = "WhatsApp:Token";
    public const string WhatsAppPhoneNumberId  = "WhatsApp:PhoneNumberId";
    public const string WhatsAppApiVersion     = "WhatsApp:ApiVersion";
    public const string SlaHorasAnticipacion   = "SlaAlert:HorasAnticipacion";
    public const string SlaHoraInicioLaboral   = "SlaAlert:HoraInicioLaboral";
    public const string SlaHoraFinLaboral      = "SlaAlert:HoraFinLaboral";
    public const string MaxFailedLoginAttempts = "Security:MaxFailedLoginAttempts";
    public const string CompanyQrExpiresAt     = "Bot:CompanyQrExpiresAt";
    public const string CompanyQrData          = "Bot:CompanyQrData";
    public const string CompanyQrMime          = "Bot:CompanyQrMime";
    public const string AdminPhoneNumber       = "Bot:AdminPhoneNumber";
    public const string CompanyQrAlertSentDate = "Bot:CompanyQrAlertSentDate";

    /// <summary>Perfil de la empresa (JSON) que encabeza los reportes exportados.</summary>
    public const string CompanyProfile         = "Company:Profile";

    /// <summary>Última corrida del job de auto-suspensión (yyyy-MM-dd), para el catch-up.</summary>
    public const string AutoSuspendLastRunDay = "autoSuspend.lastRunDay";

    /// <summary>Última purga de tokens caducados (yyyy-MM-dd), para el catch-up.</summary>
    public const string TokenCleanupLastRunDay = "tokenCleanup.lastRunDay";

    /// <summary>Última corrida del job que aplica los cambios de plan diferidos (yyyy-MM-dd).</summary>
    public const string PlanChangeLastRunDay = "planChange.lastRunDay";

    public const string BillingLastGeneratedMonth = "billing.lastGeneratedMonth";
    public const string BillingLastVoidedMonth    = "billing.lastVoidedMonth";
    public const string BillingLastReminderMonth  = "billing.lastReminderMonth";
    public const string BillingLastOverdueDay     = "billing.lastOverdueDay";

    public const string CoverageMaxCableDropMeters   = "Coverage:MaxCableDropMeters";
    public const string CoverageSinuosityFactor      = "Coverage:SinuosityFactor";
    public const string CoveragePortReservationTtlHours = "Coverage:PortReservationTtlHours";
    public const string CoverageGeocodeMinConfidence     = "Coverage:GeocodeMinConfidence";

    /// <summary>Umbral de "cerca del borde" — un punto fuera de cualquier
    /// zona pero a esta distancia o menos de la más cercana escala a un agente
    /// (NEAR_ZONE_BOUNDARY) en vez de responder NO_COVERAGE directo.</summary>
    public const string CoverageNearZoneBoundaryMeters = "Coverage:NearZoneBoundaryMeters";

    public const string AutoSuspendActivo     = "AutoSuspend:Activo";
    public const string AutoSuspendDiasGracia = "AutoSuspend:DiasGracia";

    public const string InstallationSlotBufferMinutes = "Installations:SlotBufferMinutes";
    public const string InstallationCancelMinHours    = "Installations:CancelMinHours";

    /// <summary>Ventana de días para considerar un reclamo técnico
    /// "recurrente" (mismo Type, mismo cliente) — dispara saltar el autodiagnóstico
    /// y ofrecer visita directo.</summary>
    public const string SupportRecurrentWindowDays = "Support:RecurrentWindowDays";

    /// <summary>Duración (minutos) de una visita técnica de soporte
    /// para el cálculo de slots — los tickets no tienen Plan.DuracionInstalacionMin
    /// como las instalaciones, así que necesitan su propio default configurable.</summary>
    public const string TicketVisitDurationMinutes = "Support:VisitDurationMinutes";
}
