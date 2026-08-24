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

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<UserSystem>(e =>
        {
            e.ToTable("UserSystems");
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.FullName).HasMaxLength(150).IsRequired();
            e.Property(u => u.Email).HasMaxLength(200).IsRequired();
            e.Property(u => u.PasswordHash).IsRequired();
            e.Property(u => u.Role).HasConversion<string>().HasMaxLength(30);
            e.Property(u => u.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(u => u.Phone).HasMaxLength(30);
            e.Property(u => u.IsDeleted).HasDefaultValue(false).IsRequired();
            e.HasIndex(u => u.IsDeleted);
            e.HasQueryFilter(u => !u.IsDeleted);
        });

        mb.Entity<TokenBlacklist>(e =>
        {
            e.ToTable("TokenBlacklists");
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.Token);
            e.HasIndex(t => t.ExpiresAt);
        });

        mb.Entity<AuditLog>(e =>
        {
            e.ToTable("AuditLogs");
            e.HasKey(a => a.Id);
            e.HasIndex(a => a.UserId);
            e.HasIndex(a => a.CreatedAt);
            e.HasIndex(a => a.Action);
            e.Property(a => a.Module).HasMaxLength(50);
            e.Property(a => a.Action).HasMaxLength(50);
            e.Property(a => a.UserAgent).HasMaxLength(512).IsRequired(false);
            e.Property(a => a.IntegrityHash).HasMaxLength(64).IsRequired(false);
        });

        mb.Entity<Plan>(e =>
        {
            e.ToTable("Plans");
            e.HasKey(p => p.Id);
            e.Property(p => p.Name).HasMaxLength(100).IsRequired();
            e.Property(p => p.MonthlyPrice).HasColumnType("decimal(10,2)");
        });

        mb.Entity<PlanHistory>(e =>
        {
            e.ToTable("PlanHistories");
            e.HasKey(h => h.Id);
            e.HasIndex(h => h.PlanId);
            e.HasIndex(h => h.ChangedAt);
            e.Property(h => h.Name).HasMaxLength(100).IsRequired();
            e.Property(h => h.MonthlyPrice).HasColumnType("decimal(10,2)");
            e.Property(h => h.ChangedByName).HasMaxLength(150).IsRequired();
            e.Property(h => h.ChangeReason).HasMaxLength(500);
            e.HasOne(h => h.Plan)
             .WithMany()
             .HasForeignKey(h => h.PlanId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<TbnSequence>(e =>
        {
            e.ToTable("TbnSequences");
            e.HasKey(t => t.Id);
            e.Property(t => t.Prefix).HasMaxLength(10);
        });

        mb.Entity<Client>(e =>
        {
            e.ToTable("Clients");
            e.HasKey(c => c.Id);
            e.HasIndex(c => c.TbnCode).IsUnique();
            e.HasIndex(c => c.IdentityCard).IsUnique();
            e.HasIndex(c => c.PhoneMain);
            e.Property(c => c.TbnCode).HasMaxLength(20).IsRequired();
            e.Property(c => c.FullName).HasMaxLength(150).IsRequired();
            e.Property(c => c.IdentityCard).HasMaxLength(20).IsRequired();
            e.Property(c => c.PhoneMain).HasMaxLength(20).IsRequired();
            e.Property(c => c.Zone).HasMaxLength(100).IsRequired();
            e.HasIndex(c => c.Zone);
            e.HasIndex(c => c.Status);
            e.Property(c => c.WinboxNumber).HasMaxLength(50).IsRequired();
            e.Property(c => c.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(c => c.GpsLatitude).HasColumnType("decimal(10,7)");
            e.Property(c => c.GpsLongitude).HasColumnType("decimal(10,7)");

            e.Property(c => c.IsDeleted).HasDefaultValue(false).IsRequired();
            e.HasIndex(c => c.IsDeleted);

            e.HasQueryFilter(c => !c.IsDeleted);

            e.HasOne(c => c.Plan)
             .WithMany()
             .HasForeignKey(c => c.PlanId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(c => c.InstalledBy)
             .WithMany()
             .HasForeignKey(c => c.InstalledByUserId)
             .OnDelete(DeleteBehavior.Restrict);

            e.Property(c => c.Xmin).IsRowVersion();
        });

        mb.Entity<Invoice>(e =>
        {
            e.ToTable("Invoices");
            e.HasKey(i => i.Id);
            e.HasIndex(i => new { i.ClientId, i.Year, i.Month, i.Type }).IsUnique();
            e.HasIndex(i => i.Status);
            e.HasIndex(i => new { i.ClientId, i.Status });
            e.HasIndex(i => i.DueDate);
            e.HasIndex(i => i.ClientId)
             .HasFilter("\"IsDeleted\" = false")
             .HasDatabaseName("IX_Invoices_ClientId_Active");
            e.Property(i => i.Amount).HasColumnType("decimal(10,2)");
            e.Property(i => i.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(i => i.Type).HasConversion<string>().HasMaxLength(20);

            e.Property(i => i.IsDeleted).HasDefaultValue(false).IsRequired();
            e.HasQueryFilter(i => !i.IsDeleted);

            // D-14: concurrencia optimista sobre la columna de sistema xmin, igual
            // que en Client. Sin esto, dos cobros simultáneos sobre la misma
            // factura se pisaban en silencio.
            e.Property(i => i.Xmin).IsRowVersion();

            e.HasOne(i => i.Client)
             .WithMany(c => c.Invoices)
             .HasForeignKey(i => i.ClientId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        mb.Entity<Payment>(e =>
        {
            e.ToTable("Payments");
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.ClientId);
            e.HasIndex(p => p.PaidAt);
            e.HasIndex(p => p.RegisteredAt);
            e.HasIndex(p => new { p.IsVoided, p.PaidAt });
            e.Property(p => p.Amount).HasColumnType("decimal(10,2)");
            e.Property(p => p.Method).HasConversion<string>().HasMaxLength(30);
            e.Property(p => p.BankReference).HasMaxLength(100).IsRequired(false);

            e.Property(p => p.IsDeleted).HasDefaultValue(false).IsRequired();
            e.HasQueryFilter(p => !p.IsDeleted);

            e.HasOne(p => p.Client)
             .WithMany(c => c.Payments)
             .HasForeignKey(p => p.ClientId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(p => p.RegisteredBy)
             .WithMany()
             .HasForeignKey(p => p.RegisteredByUserId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<CreditMovement>(e =>
        {
            e.ToTable("CreditMovements");
            e.HasKey(m => m.Id);
            e.HasIndex(m => new { m.ClientId, m.CreatedAt });

            e.Property(m => m.Amount).HasColumnType("numeric(18,2)");
            e.Property(m => m.BalanceAfter).HasColumnType("numeric(18,2)");
            e.Property(m => m.Type).HasConversion<string>().HasMaxLength(30);
            e.Property(m => m.Notes).HasMaxLength(500);

            e.HasOne(m => m.Client)
             .WithMany()
             .HasForeignKey(m => m.ClientId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(m => m.CreatedBy)
             .WithMany()
             .HasForeignKey(m => m.CreatedByUserId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        mb.Entity<CashClose>(e =>
        {
            e.ToTable("CashCloses");
            e.HasKey(c => c.Id);

            // La columna se creó como jsonb (20260414000002_AddM2PaymentsAndBilling)
            // pero la propiedad es string: sin este mapeo Npgsql envía el parámetro
            // como text y PostgreSQL rechaza la escritura con
            // "42804: column DetailJson is of type jsonb but expression is of type text",
            // rompiendo el cierre de caja en producción.
            e.Property(c => c.DetailJson).HasColumnType("jsonb");

            // Tipos alineados con la migración 20260414000002 (el snapshot los tenía
            // como "numeric"/"text" genéricos, divergiendo de la tabla real).
            e.Property(c => c.TotalAmount).HasColumnType("numeric(18,2)");
            e.Property(c => c.PdfPath).HasMaxLength(500);

            e.HasIndex(c => new { c.UserId, c.ClosedAt });

            e.HasOne(c => c.User)
             .WithMany()
             .HasForeignKey(c => c.UserId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<PaymentInvoice>(e =>
        {
            e.ToTable("PaymentInvoices");
            e.HasKey(pi => pi.Id);
            e.HasIndex(pi => new { pi.PaymentId, pi.InvoiceId }).IsUnique();
            e.Property(pi => pi.AmountApplied).HasColumnType("numeric(18,2)");

            e.HasOne(pi => pi.Payment)
             .WithMany(p => p.PaymentInvoices)
             .HasForeignKey(pi => pi.PaymentId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(pi => pi.Invoice)
             .WithMany(i => i.PaymentInvoices)
             .HasForeignKey(pi => pi.InvoiceId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        mb.Entity<SupportTicket>(e =>
        {
            e.ToTable("SupportTickets");
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.Status);
            e.HasIndex(t => t.Priority);
            e.HasIndex(t => t.ClientId);
            e.HasIndex(t => t.AssignedToUserId);
            e.HasIndex(t => new { t.Status, t.Priority });
            e.HasIndex(t => t.CreatedAt);
            e.HasIndex(t => t.ResolvedAt);
            e.HasQueryFilter(t => t.Client == null || !t.Client.IsDeleted);
            e.Property(t => t.Subject).HasMaxLength(200).IsRequired();
            e.Property(t => t.Type).HasConversion<string>().HasMaxLength(30);
            e.Property(t => t.Priority).HasConversion<string>().HasMaxLength(20);
            e.Property(t => t.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(t => t.Origin).HasConversion<string>().HasMaxLength(20);
            e.Property(t => t.Description).IsRequired();
            e.Property(t => t.SupportGroup).HasMaxLength(100).IsRequired(false);
            e.Property(t => t.ResolutionMessage).IsRequired(false);
            e.Property(t => t.RootCause).IsRequired(false);
            e.Property(t => t.SlaAlertSentAt).IsRequired(false);
            e.Property(t => t.SlaCompliant).IsRequired(false);
            e.Property(t => t.ProspectName).HasMaxLength(200).IsRequired(false);
            e.Property(t => t.ProspectPhone).HasMaxLength(30).IsRequired(false);
            e.Property(t => t.ProspectIdentityCard).HasMaxLength(30).IsRequired(false);
            e.Property(t => t.ProspectBackupPhone).HasMaxLength(30).IsRequired(false);
            e.HasOne(t => t.Client)
             .WithMany()
             .HasForeignKey(t => t.ClientId)
             .IsRequired(false)
             .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.AssignedTo)
             .WithMany()
             .HasForeignKey(t => t.AssignedToUserId)
             .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.CreatedBy)
             .WithMany()
             .HasForeignKey(t => t.CreatedByUserId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<TicketNotification>(e =>
        {
            e.ToTable("TicketNotifications");
            e.HasKey(n => n.Id);
            e.Property(n => n.Type).HasConversion<string>().HasMaxLength(30);
            e.Property(n => n.Status).HasConversion<string>().HasMaxLength(10);
            e.Property(n => n.Recipient).HasMaxLength(200).IsRequired();
            e.Property(n => n.Message).IsRequired();
            e.Property(n => n.ErrorDetail).IsRequired(false);
            e.HasOne(n => n.Ticket)
             .WithMany(t => t.Notifications)
             .HasForeignKey(n => n.TicketId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        mb.Entity<TicketComment>(e =>
        {
            e.ToTable("TicketComments");
            e.HasKey(c => c.Id);
            e.Property(c => c.Type).HasConversion<string>().HasMaxLength(30);
            e.Property(c => c.Body).IsRequired();
            e.HasOne(c => c.Ticket)
             .WithMany(t => t.Comments)
             .HasForeignKey(c => c.TicketId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.Author)
             .WithMany()
             .HasForeignKey(c => c.AuthorId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<TicketWorkLog>(e =>
        {
            e.ToTable("TicketWorkLogs");
            e.HasKey(w => w.Id);
            e.Property(w => w.Notes).IsRequired(false);
            e.HasOne(w => w.Ticket)
             .WithMany(t => t.WorkLogs)
             .HasForeignKey(w => w.TicketId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(w => w.User)
             .WithMany()
             .HasForeignKey(w => w.UserId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<TicketCannedResponse>(e =>
        {
            e.ToTable("TicketCannedResponses");
            e.HasKey(r => r.Id);
            e.HasIndex(r => r.IsActive);
            e.Property(r => r.Title).HasMaxLength(200).IsRequired();
            e.Property(r => r.Body).IsRequired();
            e.Property(r => r.Category).HasMaxLength(100).IsRequired(false);
            e.Property(r => r.IsActive).HasDefaultValue(true);
            e.HasOne<TelecomBoliviaNet.Domain.Entities.Auth.UserSystem>()
             .WithMany()
             .HasForeignKey(r => r.CreatedByUserId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<TicketVisit>(e =>
        {
            e.ToTable("TicketVisits");
            e.HasKey(v => v.Id);
            e.Property(v => v.Observations).IsRequired(false);
            e.HasOne(v => v.Ticket)
             .WithMany(t => t.Visits)
             .HasForeignKey(v => v.TicketId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(v => v.Technician)
             .WithMany()
             .HasForeignKey(v => v.TechnicianId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<SlaPlan>(e =>
        {
            e.ToTable("SlaPlans");
            e.HasKey(s => s.Id);
            e.HasIndex(s => s.Priority).IsUnique();
            e.Property(s => s.Name).HasMaxLength(100).IsRequired();
            e.Property(s => s.Priority).HasMaxLength(15).IsRequired();
            e.Property(s => s.Schedule).HasConversion<string>().HasMaxLength(20);
            e.HasOne(s => s.BusinessSchedule)
             .WithMany()
             .HasForeignKey(s => s.BusinessScheduleId)
             .IsRequired(false)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<SlaPlan>().HasData(
            new SlaPlan { Id = Guid.Parse("00000000-0000-0000-0002-000000000001"), Name = "SLA Crítico", Priority = "Critica", FirstResponseMinutes = 15,  ResolutionMinutes = 240,  Schedule = SlaSchedule.Veinticuatro7, IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new SlaPlan { Id = Guid.Parse("00000000-0000-0000-0002-000000000002"), Name = "SLA Alto",    Priority = "Alta",    FirstResponseMinutes = 30,  ResolutionMinutes = 480,  Schedule = SlaSchedule.Veinticuatro7, IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new SlaPlan { Id = Guid.Parse("00000000-0000-0000-0002-000000000003"), Name = "SLA Medio",   Priority = "Media",   FirstResponseMinutes = 120, ResolutionMinutes = 1440, Schedule = SlaSchedule.Laboral,       IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new SlaPlan { Id = Guid.Parse("00000000-0000-0000-0002-000000000004"), Name = "SLA Bajo",    Priority = "Baja",    FirstResponseMinutes = 240, ResolutionMinutes = 4320, Schedule = SlaSchedule.Laboral,       IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) }
        );

        mb.Entity<BusinessSchedule>(e =>
        {
            e.ToTable("BusinessSchedules");
            e.HasKey(s => s.Id);
            e.HasIndex(s => s.IsDefault);
            e.HasIndex(s => s.IsActive);
            e.Property(s => s.Name).HasMaxLength(100).IsRequired();
            e.Property(s => s.TimeZoneName).HasMaxLength(50).IsRequired();
            e.Property(s => s.UpdatedAt).IsRequired(false);
        });

        mb.Entity<BusinessSchedule>().HasData(new
        {
            Id              = Guid.Parse("00000000-0000-0000-0007-000000000001"),
            Name            = "Horario Laboral Bolivia",
            TimeZoneName    = "America/La_Paz",
            UtcOffsetHours  = -4,
            WorkingDaysMask = 31,
            StartHour       = 8,
            EndHour         = 18,
            Is24x7          = false,
            IsDefault       = true,
            IsActive        = true,
            CreatedAt       = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            UpdatedAt       = (DateTime?)null,
        });

        mb.Entity<ScheduleHoliday>(e =>
        {
            e.ToTable("ScheduleHolidays");
            e.HasKey(h => h.Id);
            e.HasIndex(h => new { h.BusinessScheduleId, h.Date }).IsUnique();
            e.Property(h => h.Name).HasMaxLength(100).IsRequired();
            e.HasOne(h => h.BusinessSchedule)
             .WithMany(s => s.Holidays)
             .HasForeignKey(h => h.BusinessScheduleId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        mb.Entity<PaymentReceipt>(e =>
        {
            e.ToTable("PaymentReceipts");
            e.HasOne(r => r.GeneratedBy)
             .WithMany()
             .HasForeignKey(r => r.GeneratedByUserId)
             .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(r => r.Client)
             .WithMany()
             .HasForeignKey(r => r.ClientId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(r => r.Payment)
             .WithMany()
             .HasForeignKey(r => r.PaymentId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        mb.Entity<WhatsAppReceipt>(e =>
        {
            e.ToTable("WhatsAppReceipts");
            e.HasKey(r => r.Id);
            e.Property(r => r.Status).HasConversion<string>().HasMaxLength(20);
            e.HasIndex(r => r.Status);
            e.HasIndex(r => r.ReceivedAt);
            e.HasOne(r => r.Client)
             .WithMany()
             .HasForeignKey(r => r.ClientId)
             .IsRequired(false)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<DashboardPreference>(e =>
        {
            e.ToTable("DashboardPreferences");
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.UserId).IsUnique();
            e.Property(p => p.ShowKpis).HasDefaultValue(true);
            e.Property(p => p.ShowTendencia).HasDefaultValue(true);
            e.Property(p => p.ShowTickets).HasDefaultValue(true);
            e.Property(p => p.ShowWhatsApp).HasDefaultValue(true);
            e.Property(p => p.ShowDeudores).HasDefaultValue(true);
            e.Property(p => p.ShowZonas).HasDefaultValue(true);
            e.Property(p => p.ShowMetodosPago).HasDefaultValue(true);
            e.Property(p => p.ShowComprobantes).HasDefaultValue(true);
            e.Property(p => p.UpdatedAt);
            e.HasOne<UserSystem>()
             .WithOne()
             .HasForeignKey<DashboardPreference>(p => p.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        mb.Entity<NotifConfig>(e =>
        {
            e.ToTable("NotifConfigs");
            e.HasKey(c => c.Id);
            e.HasIndex(c => c.Tipo).IsUnique();
            e.Property(c => c.Tipo).HasConversion<string>().HasMaxLength(30);
            e.Property(c => c.HoraInicio).HasColumnType("time");
            e.Property(c => c.HoraFin).HasColumnType("time");
            e.Property(c => c.PlantillaId).IsRequired(false);
        });

        mb.Entity<NotifTemplate>(e =>
        {
            e.ToTable("NotifPlantillas");
            e.HasKey(p => p.Id);
            e.HasIndex(p => new { p.Tipo, p.Activa });
            e.Property(p => p.Tipo).HasConversion<string>().HasMaxLength(30);
            e.Property(p => p.Texto).IsRequired();
            e.Property(p => p.Categoria).HasConversion<string>().HasMaxLength(20);
            e.Property(p => p.HsmStatus).HasConversion<string>().HasMaxLength(15);
        });

        mb.Entity<PasswordResetToken>(e =>
        {
            e.ToTable("PasswordResetTokens");
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.Token).IsUnique();
            e.Property(t => t.Token).HasMaxLength(100);
            e.Property(t => t.Channel).HasMaxLength(20);
        });

        mb.Entity<EmailActivationToken>(e =>
        {
            e.ToTable("EmailActivationTokens");
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.Token).IsUnique();
            e.HasIndex(t => t.UserId);
            e.Property(t => t.Token).HasMaxLength(64).IsRequired();
        });

        mb.Entity<NotifSegment>(e =>
        {
            e.ToTable("NotifSegments");
            e.HasKey(s => s.Id);
            e.HasIndex(s => s.Nombre).IsUnique();
            e.Property(s => s.Nombre).HasMaxLength(100).IsRequired();
            e.Property(s => s.Descripcion).HasMaxLength(500);
            e.Property(s => s.ReglasJson).HasColumnType("jsonb").HasDefaultValue("[]");
        });

        mb.Entity<NotifTemplateHistory>(e =>
        {
            e.ToTable("NotifPlantillaHistorial");
            e.HasKey(h => h.Id);
            e.Property(h => h.Tipo).HasConversion<string>().HasMaxLength(30);
            e.Property(h => h.Texto).IsRequired();
        });

        mb.Entity<NotifOutbox>(e =>
        {
            e.ToTable("NotifOutbox");
            e.HasKey(o => o.Id);
            e.HasIndex(o => new { o.EstadoFinal, o.Publicado, o.EnviarDesde });
            e.HasIndex(o => o.ClienteId);
            e.HasIndex(o => new { o.Publicado, o.EstadoFinal })
             .HasFilter("\"Publicado\" = false AND \"EstadoFinal\" IS NULL")
             .HasDatabaseName("IX_NotifOutbox_Pending");
            e.Property(o => o.Tipo).HasConversion<string>().HasMaxLength(30);
            e.Property(o => o.EstadoFinal).HasConversion<string>().HasMaxLength(15).IsRequired(false);
            e.Property(o => o.PhoneNumber).HasMaxLength(30);
            e.Property(o => o.ContextoJson).HasColumnType("jsonb").HasDefaultValue("{}");
            e.HasOne(o => o.Cliente)
             .WithMany()
             .HasForeignKey(o => o.ClienteId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<NotifLog>(e =>
        {
            e.ToTable("NotifLogs");
            e.HasKey(l => l.Id);
            e.HasIndex(l => new { l.ClienteId, l.RegistradoAt });
            e.HasIndex(l => new { l.ClienteId, l.Tipo, l.RegistradoAt });
            e.Property(l => l.Tipo).HasConversion<string>().HasMaxLength(30);
            e.Property(l => l.Estado).HasConversion<string>().HasMaxLength(15);
            e.Property(l => l.PhoneNumber).HasMaxLength(30);
            e.Property(l => l.Mensaje).IsRequired();
            e.Property(l => l.ErrorDetalle).IsRequired(false);
            e.HasOne(l => l.Cliente)
             .WithMany()
             .HasForeignKey(l => l.ClienteId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<Installation>(e =>
        {
            e.ToTable("Installations");
            e.HasKey(i => i.Id);
            e.Property(i => i.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(i => i.Direccion).HasMaxLength(300).IsRequired();
            e.Property(i => i.CanceladoPor).HasMaxLength(10).IsRequired(false);
            e.Property(i => i.HoraInicio).HasColumnType("time without time zone");
            e.Property(i => i.GpsLatitude).HasColumnType("decimal(10,7)").IsRequired(false);
            e.Property(i => i.GpsLongitude).HasColumnType("decimal(10,7)").IsRequired(false);
            e.Property(i => i.LocationSource).HasMaxLength(30).IsRequired(false);
            e.Property(i => i.ProspectName).HasMaxLength(200).IsRequired(false);
            e.Property(i => i.ProspectPhone).HasMaxLength(30).IsRequired(false);
            e.Property(i => i.ProspectIdentityCard).HasMaxLength(30).IsRequired(false);
            e.Property(i => i.ProspectBackupPhone).HasMaxLength(30).IsRequired(false);
            e.Property(i => i.EquipoOnuSerial).HasMaxLength(100).IsRequired(false);
            e.Property(i => i.ChecklistJson).IsRequired(false);
            e.Property(i => i.FotosUrlsJson).IsRequired(false);
            e.HasIndex(i => new { i.Fecha, i.HoraInicio });
            e.HasIndex(i => i.Status);
            e.HasIndex(i => i.ClientId);
            e.HasOne(i => i.Client).WithMany().HasForeignKey(i => i.ClientId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(i => i.Plan).WithMany().HasForeignKey(i => i.PlanId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(i => i.Tecnico).WithMany().HasForeignKey(i => i.TecnicoId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(i => i.Ticket).WithMany().HasForeignKey(i => i.TicketId).OnDelete(DeleteBehavior.SetNull);
        });

        mb.ApplyConfiguration(new Config.InstallationTechnicianConfig());
        mb.ApplyConfiguration(new Config.VisitTechnicianConfig());

        mb.Entity<CoverageZone>(e =>
        {
            e.ToTable("CoverageZones");
            e.HasKey(z => z.Id);
            e.HasIndex(z => z.Nombre).IsUnique();
            e.HasIndex(z => z.Estado);
            e.Property(z => z.Nombre).HasMaxLength(200).IsRequired();
            e.Property(z => z.Tecnologia).HasMaxLength(20).IsRequired();
            e.Property(z => z.Estado).HasConversion<string>().HasMaxLength(20);
            e.Property(z => z.Geom).HasColumnType("geometry(Polygon,4326)");
        });

        mb.Entity<DistributionBox>(e =>
        {
            e.ToTable("DistributionBoxes");
            e.HasKey(b => b.Id);
            e.HasIndex(b => b.Codigo).IsUnique();
            e.HasIndex(b => b.ZoneId);
            e.HasIndex(b => b.Estado);
            e.Property(b => b.Codigo).HasMaxLength(50).IsRequired();
            e.Property(b => b.DireccionReferencia).HasMaxLength(300).IsRequired();
            e.Property(b => b.Estado).HasConversion<string>().HasMaxLength(20);
            e.Property(b => b.Location).HasColumnType("geometry(Point,4326)");
            e.HasOne(b => b.Zone)
             .WithMany()
             .HasForeignKey(b => b.ZoneId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        mb.Entity<CoverageQuery>(e =>
        {
            e.ToTable("CoverageQueries");
            e.HasKey(q => q.Id);
            e.HasIndex(q => q.QueriedAt);
            e.HasIndex(q => q.Result);
            e.Property(q => q.InputType).HasConversion<string>().HasMaxLength(20);
            e.Property(q => q.Channel).HasConversion<string>().HasMaxLength(20);
            e.Property(q => q.Result).HasMaxLength(40).IsRequired();
            e.Property(q => q.ZoneName).HasMaxLength(200);
            e.Property(q => q.ContactPhone).HasMaxLength(30);
            e.Property(q => q.ContactName).HasMaxLength(200);
            e.Property(q => q.Location).HasColumnType("geometry(Point,4326)");
            // MatchedBoxId es una referencia "suelta" (sin FK): el log persiste aunque
            // la caja se elimine después.
        });

        mb.Entity<PortReservation>(e =>
        {
            e.ToTable("PortReservations");
            e.HasKey(r => r.Id);
            e.Property(r => r.Status).HasConversion<string>().HasMaxLength(20);
            // El job de expiración barre por (Status, ExpiresAt); la liberación
            // busca la reserva vigente por instalación.
            e.HasIndex(r => new { r.Status, r.ExpiresAt });
            e.HasIndex(r => r.InstallationId);
            // Sin FK a DistributionBoxes/Installations: la reserva es un registro
            // de capacidad que sobrevive a borrados y no arrastra cascadas.
        });

        mb.Entity<NapPort>(e =>
        {
            e.ToTable("NapPorts");
            e.HasKey(p => p.Id);
            e.Property(p => p.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(p => p.OnuSerial).HasMaxLength(100);
            e.HasIndex(p => new { p.DistributionBoxId, p.Numero }).IsUnique();
            e.HasIndex(p => p.Status);
            // FK con cascada: borrar la caja limpia sus puertos automáticamente.
            e.HasOne<DistributionBox>()
             .WithMany()
             .HasForeignKey(p => p.DistributionBoxId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        mb.Entity<GeocodeCache>(e =>
        {
            e.ToTable("GeocodeCaches");
            e.HasKey(g => g.Id);
            e.Property(g => g.NormalizedQuery).HasMaxLength(400).IsRequired();
            e.HasIndex(g => g.NormalizedQuery).IsUnique(); // clave de caché
            e.Property(g => g.DisplayName).HasMaxLength(500);
            e.Property(g => g.Location).HasColumnType("geometry(Point,4326)");
        });

        mb.Entity<ClientQr>(e =>
        {
            e.ToTable("ClientQrs");
            e.HasKey(q => q.Id);
            e.HasIndex(q => new { q.ClientId, q.IsActive });
            e.HasIndex(q => new { q.ExpiresAt, q.IsActive, q.AlertSent });
            e.HasOne(q => q.Client).WithMany().HasForeignKey(q => q.ClientId).OnDelete(DeleteBehavior.Cascade);
        });

        mb.Entity<PlanChangeRequest>(e =>
        {
            e.ToTable("PlanChangeRequests");
            e.HasKey(r => r.Id);
            e.Property(r => r.Status).HasConversion<string>().HasMaxLength(15);
            e.HasIndex(r => new { r.ClientId, r.Status });
            e.HasOne(r => r.Client).WithMany().HasForeignKey(r => r.ClientId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(r => r.OldPlan).WithMany().HasForeignKey(r => r.OldPlanId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(r => r.NewPlan).WithMany().HasForeignKey(r => r.NewPlanId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(r => r.Ticket).WithMany().HasForeignKey(r => r.TicketId).OnDelete(DeleteBehavior.SetNull);
        });


        mb.Entity<TbnSequence>().HasData(new TbnSequence { Id = 1, LastValue = 0, Prefix = "TBN" });

        mb.Entity<Plan>().HasData(
            new Plan { Id = Guid.Parse("00000000-0000-0000-0001-000000000001"), Name = "Plan Cobre", SpeedMb = 30, MonthlyPrice = 99.00m,  IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new Plan { Id = Guid.Parse("00000000-0000-0000-0001-000000000002"), Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149.00m, IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new Plan { Id = Guid.Parse("00000000-0000-0000-0001-000000000003"), Name = "Plan Oro",   SpeedMb = 80, MonthlyPrice = 199.00m, IsActive = true, CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc) }
        );

        var seedDate = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var adminId  = Guid.Parse("00000000-0000-0000-0000-000000000001");

        mb.Entity<NotifConfig>().HasData(
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000001"), Tipo = NotifType.SUSPENSION,        Activo = true, DelaySegundos = 0,    HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = null, ActualizadoAt = seedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000002"), Tipo = NotifType.REACTIVACION,      Activo = true, DelaySegundos = 0,    HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = null, ActualizadoAt = seedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000003"), Tipo = NotifType.RECORDATORIO_R1,   Activo = true,  DelaySegundos = 0, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = 5, ActualizadoAt = seedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000004"), Tipo = NotifType.RECORDATORIO_R2,   Activo = false, DelaySegundos = 0, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = 3, ActualizadoAt = seedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000005"), Tipo = NotifType.RECORDATORIO_R3,   Activo = false, DelaySegundos = 0, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = 1, ActualizadoAt = seedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000006"), Tipo = NotifType.FACTURA_VENCIDA,   Activo = true, DelaySegundos = 3600, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = null, ActualizadoAt = seedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000007"), Tipo = NotifType.CONFIRMACION_PAGO, Activo = true, DelaySegundos = 0,    HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = true,  DiasAntes = null, ActualizadoAt = seedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000009"), Tipo = NotifType.TICKET_CREADO,    Activo = true, DelaySegundos = 0, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = null, ActualizadoAt = seedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000010"), Tipo = NotifType.TICKET_RESUELTO,  Activo = true, DelaySegundos = 0, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = null, ActualizadoAt = seedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000011"), Tipo = NotifType.CAMBIO_PLAN,      Activo = true, DelaySegundos = 0, HoraInicio = new TimeOnly(8,0), HoraFin = new TimeOnly(20,0), Inmediato = false, DiasAntes = null, ActualizadoAt = seedDate },
            new NotifConfig { Id = Guid.Parse("00000000-0000-0000-0008-000000000012"), Tipo = NotifType.ALERTA_SLA,       Activo = true, DelaySegundos = 0, HoraInicio = new TimeOnly(7,0), HoraFin = new TimeOnly(22,0), Inmediato = true,  DiasAntes = null, ActualizadoAt = seedDate }
        );

        mb.Entity<NotifTemplate>().HasData(
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000001"), Tipo = NotifType.SUSPENSION,        Activa = true, CreadoAt = seedDate, CreadoPorId = adminId, Texto = "Estimado/a {{nombre}},\n\nSu servicio *{{plan}}* ha sido *suspendido* por falta de pago.\nComuníquese con nosotros para regularizar su cuenta.\n\n*TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000002"), Tipo = NotifType.REACTIVACION,      Activa = true, CreadoAt = seedDate, CreadoPorId = adminId, Texto = "Estimado/a {{nombre}},\n\nSu servicio *{{plan}}* ha sido *reactivado* exitosamente. ¡Ya puede usarlo con normalidad!\n\n*TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000003"), Tipo = NotifType.RECORDATORIO_R1,   Activa = true, CreadoAt = seedDate, CreadoPorId = adminId, Texto = "Estimado/a {{nombre}},\n\nLe recordamos que tiene una factura de *Bs. {{monto}}* con vencimiento el *{{fecha_vencimiento}}* ({{meses_pendientes}} mes(es) pendiente(s)).\n\nEvite inconvenientes pagando antes del vencimiento.\n\n*TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000004"), Tipo = NotifType.RECORDATORIO_R2,   Activa = true, CreadoAt = seedDate, CreadoPorId = adminId, Texto = "Estimado/a {{nombre}},\n\n⚠️ Su factura de *Bs. {{monto}}* vence el *{{fecha_vencimiento}}*. Evite la suspensión del servicio pagando a tiempo.\n\n*TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000005"), Tipo = NotifType.RECORDATORIO_R3,   Activa = true, CreadoAt = seedDate, CreadoPorId = adminId, Texto = "Estimado/a {{nombre}},\n\n🚨 Su factura vence *mañana* ({{fecha_vencimiento}}). Monto: *Bs. {{monto}}*.\nRealice su pago hoy para no perder el servicio.\n\n*TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000006"), Tipo = NotifType.FACTURA_VENCIDA,   Activa = true, CreadoAt = seedDate, CreadoPorId = adminId, Texto = "Estimado/a {{nombre}},\n\nSu factura del periodo *{{periodo}}* por *Bs. {{monto}}* está *vencida*.\nPor favor regularice su pago para evitar la suspensión del servicio.\n\n*TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000007"), Tipo = NotifType.CONFIRMACION_PAGO, Activa = true, CreadoAt = seedDate, CreadoPorId = adminId, Texto = "Estimado/a {{nombre}},\n\n✅ Hemos registrado su pago de *Bs. {{monto}}* correspondiente al periodo *{{periodo}}*.\n\nGracias por su pago puntual. *TelecomBoliviaNet*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000009"), Tipo = NotifType.TICKET_CREADO,   Activa = true, Categoria = TemplateCategory.Ticket, HsmStatus = HsmStatus.Aprobada, CreadoAt = seedDate, CreadoPorId = adminId, Texto = "Estimado/a {{nombre}},\n\nSu solicitud de soporte ha sido registrada con el número *{{num_ticket}}*.\n\nLe atenderemos a la brevedad. *{{empresa}}*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000010"), Tipo = NotifType.TICKET_RESUELTO, Activa = true, Categoria = TemplateCategory.Ticket, HsmStatus = HsmStatus.Aprobada, CreadoAt = seedDate, CreadoPorId = adminId, Texto = "Estimado/a {{nombre}},\n\nSu ticket *{{num_ticket}}* ha sido *resuelto* por {{tecnico}}.\n\nSi tiene alguna consulta adicional, contáctenos. *{{empresa}}*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000011"), Tipo = NotifType.CAMBIO_PLAN,     Activa = true, Categoria = TemplateCategory.Cobro,   HsmStatus = HsmStatus.Aprobada, CreadoAt = seedDate, CreadoPorId = adminId, Texto = "Estimado/a {{nombre}},\n\nSu plan de servicio ha sido actualizado a *{{plan}}*.\n\nEl cambio es efectivo inmediatamente. *{{empresa}}*" },
            new NotifTemplate { Id = Guid.Parse("00000000-0000-0000-0009-000000000012"), Tipo = NotifType.ALERTA_SLA,      Activa = true, Categoria = TemplateCategory.Tecnico, HsmStatus = HsmStatus.Pendiente, CreadoAt = seedDate, CreadoPorId = adminId, Texto = "⚠️ *ALERTA SLA* — Ticket {{num_ticket}}\nCliente: {{cliente}}\nVence en: menos de {{horas}}h ({{vence}}){{sin_tecnico}}\nPor favor atienda a la brevedad." }
        );

        mb.Entity<RefreshToken>(e =>
        {
            e.ToTable("RefreshTokens");
            e.HasKey(t => t.Id);
            e.Property(t => t.TokenHash).HasMaxLength(64).IsRequired();
            e.Property(t => t.CreatedByIp).HasMaxLength(50);
            e.Property(t => t.ReplacedByTokenHash).HasMaxLength(64);
            e.HasIndex(t => t.TokenHash).IsUnique();
            e.HasIndex(t => new { t.UserId, t.ExpiresAt });
        });

        mb.Entity<SystemConfig>(e =>
        {
            e.ToTable("SystemConfigs");
            e.HasKey(c => c.Id);
            e.Property(c => c.Key).HasMaxLength(100).IsRequired();
            e.Property(c => c.Value).IsRequired();
            e.Property(c => c.IsSecret).HasDefaultValue(false);
            e.HasIndex(c => c.Key).IsUnique();
        });

        mb.Entity<InternalAlert>(e =>
        {
            e.ToTable("InternalAlerts");
            e.HasKey(a => a.Id);
            e.Property(a => a.Type).HasMaxLength(50).IsRequired();
            e.Property(a => a.Title).HasMaxLength(200).IsRequired();
            e.Property(a => a.Message).HasMaxLength(500).IsRequired();
            e.Property(a => a.Link).HasMaxLength(300).IsRequired();
            e.Property(a => a.ForRole).HasMaxLength(30);
            e.Property(a => a.IsRead).HasDefaultValue(false);
            e.HasIndex(a => new { a.ForRole, a.IsRead });
            e.HasIndex(a => new { a.ForUserId, a.IsRead });
            e.HasIndex(a => a.CreatedAt);
        });
    }
}
