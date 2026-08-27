using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Entities.Dashboard;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Alerts;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Entities.Payments;

namespace TelecomBoliviaNet.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public DbSet<UserSystem>     UserSystems     { get; set; }
    public DbSet<TokenBlacklist> TokenBlacklists { get; set; }
    public DbSet<RefreshToken>   RefreshTokens   { get; set; }
    public DbSet<AuditLog>       AuditLogs       { get; set; }

    public DbSet<Plan>           Plans           { get; set; }
    public DbSet<TbnSequence>    TbnSequences    { get; set; }
    public DbSet<Client>         Clients         { get; set; }
    public DbSet<Invoice>        Invoices        { get; set; }
    public DbSet<Payment>        Payments        { get; set; }
    public DbSet<PaymentInvoice>   PaymentInvoices  { get; set; }
    public DbSet<ClientAttachment>   ClientAttachments  { get; set; }
    public DbSet<TicketAttachment>  TicketAttachments  { get; set; }
    public DbSet<TicketSequence>    TicketSequences    { get; set; }
    public DbSet<CreditMovement>   CreditMovements  { get; set; }
    public DbSet<CashClose>        CashCloses       { get; set; }
    public DbSet<PaymentReceipt>   PaymentReceipts  { get; set; }
    public DbSet<InvoiceSequence>  InvoiceSequences { get; set; }
    public DbSet<ReceiptSequence>  ReceiptSequences { get; set; }

    public DbSet<SupportTicket>       SupportTickets        { get; set; }
    public DbSet<TicketNotification>  TicketNotifications   { get; set; }
    public DbSet<TicketComment>       TicketComments        { get; set; }
    public DbSet<TicketWorkLog>       TicketWorkLogs        { get; set; }
    public DbSet<TicketVisit>         TicketVisits          { get; set; }
    public DbSet<SlaPlan>             SlaPlans              { get; set; }
    public DbSet<WhatsAppReceipt>     WhatsAppReceipts      { get; set; }
    public DbSet<BusinessSchedule>    BusinessSchedules     { get; set; }
    public DbSet<ScheduleHoliday>     ScheduleHolidays      { get; set; }
    public DbSet<TicketCannedResponse> TicketCannedResponses { get; set; }

    public DbSet<DashboardPreference> DashboardPreferences { get; set; }

    public DbSet<PasswordResetToken>    PasswordResetTokens    { get; set; }
    public DbSet<EmailActivationToken>  EmailActivationTokens  { get; set; }

    public DbSet<NotifConfig>             NotifConfigs            { get; set; }
    public DbSet<NotifTemplate>          NotifPlantillas         { get; set; }
    public DbSet<NotifTemplateHistory> NotifTemplateHistory { get; set; }
    public DbSet<NotifOutbox>             NotifOutbox             { get; set; }
    public DbSet<NotifLog>                NotifLogs               { get; set; }
    public DbSet<NotifSegment>            NotifSegments           { get; set; }

    public DbSet<Installation>             Installations            { get; set; }
    public DbSet<InstallationTechnician>   InstallationTechnicians  { get; set; }
    public DbSet<VisitTechnician>          VisitTechnicians         { get; set; }

    public DbSet<ClientQr>           ClientQrs          { get; set; }

    public DbSet<PlanChangeRequest>  PlanChangeRequests { get; set; }

    public DbSet<PlanHistory>        PlanHistories      { get; set; }

    public DbSet<SystemConfig>       SystemConfigs      { get; set; }

    public DbSet<InternalAlert>      InternalAlerts     { get; set; }

    public DbSet<CoverageZone>       CoverageZones      { get; set; }
    public DbSet<DistributionBox>    DistributionBoxes  { get; set; }
    public DbSet<CoverageQuery>      CoverageQueries    { get; set; }
    public DbSet<PortReservation>    PortReservations   { get; set; }
    public DbSet<GeocodeCache>       GeocodeCaches      { get; set; }
    public DbSet<NapPort>            NapPorts           { get; set; }

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    /// <summary>
    /// El mapeo vive en <c>Data/Config/</c>, un archivo por entidad.
    ///
    /// <para>Antes eran 760 líneas aquí dentro: 44 bloques
    /// <c>mb.Entity&lt;T&gt;(...)</c> seguidos, más los datos semilla. Cambiar el
    /// mapeo de una entidad obligaba a navegar un archivo de 847 líneas y el
    /// diff de cualquier cambio tocaba el mismo fichero que todos los demás.</para>
    ///
    /// <para>La red de seguridad de esta mudanza NO es "generar una migración y
    /// ver que sale vacía" —en este proyecto las migraciones están escritas a
    /// mano y EF ya reporta deriva, así que nunca sale vacía—: es
    /// <c>SchemaParityTests</c>, que compara el modelo de EF contra
    /// <c>information_schema</c> después de aplicar las migraciones reales.
    /// Ver ADR-004.</para>
    /// </summary>
    protected override void OnModelCreating(ModelBuilder mb)
        => mb.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
}
