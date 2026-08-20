using TelecomBoliviaNet.Application.Installations.Commands;
using TelecomBoliviaNet.Application.Installations.Services;
using TelecomBoliviaNet.Infrastructure.Security;
using TelecomBoliviaNet.Application.Services.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Payments;
using TelecomBoliviaNet.Application.Services.Invoices;
using TelecomBoliviaNet.Infrastructure.Jobs;
using TelecomBoliviaNet.Application.Interfaces.Auth;
using TelecomBoliviaNet.Application.Interfaces.Notifications;
using TelecomBoliviaNet.Infrastructure.Configuration;
using TelecomBoliviaNet.Infrastructure.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Infrastructure.Services;
using TelecomBoliviaNet.Infrastructure.Services.Clients;
using TelecomBoliviaNet.Application.Services.Bot;
using TelecomBoliviaNet.Presentation.Hubs;
using Microsoft.EntityFrameworkCore;
using FluentValidation;

using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Validators.Auth;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Audit;

using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.DTOs.Plans;
using TelecomBoliviaNet.Application.Services.Clients;
using TelecomBoliviaNet.Application.Services.Plans;
using TelecomBoliviaNet.Application.Validators.Clients;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;

using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Services.Tickets;
using TelecomBoliviaNet.Application.Tickets.Helpers;
using TelecomBoliviaNet.Application.Validators.Tickets;


using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Notifications;

using TelecomBoliviaNet.Application.Services.Alerts;
using TelecomBoliviaNet.Domain.Entities.Alerts;

using TelecomBoliviaNet.Application.Services.Admin;

using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Services;

using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Application.Coverage;
using TelecomBoliviaNet.Application.Coverage.Services;
using TelecomBoliviaNet.Infrastructure.Services.Coverage;

using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;
using TelecomBoliviaNet.Infrastructure.Repositories;
using MediatR;
using TelecomBoliviaNet.Application.Behaviors;

namespace TelecomBoliviaNet.Presentation.Configuration;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(
        this IServiceCollection services, IConfiguration config)
    {
        return services
            .AddDatabase(config)
            .AddRepositories()
            .AddServices(config)
            .AddValidators()
            .AddMediatRHandlers();
    }

    private static IServiceCollection AddDatabase(
        this IServiceCollection services, IConfiguration config)
    {
        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(
                config.GetConnectionString("DefaultConnection"),
                npgsql => npgsql
                    .MigrationsAssembly("TelecomBoliviaNet.Infrastructure")
                    .UseNetTopologySuite()));
        return services;
    }

    private static IServiceCollection AddRepositories(this IServiceCollection services)
    {
        services.AddScoped<IGenericRepository<UserSystem>,            GenericRepository<UserSystem>>();
        services.AddScoped<IGenericRepository<TokenBlacklist>,        GenericRepository<TokenBlacklist>>();
        services.AddScoped<IGenericRepository<RefreshToken>,          GenericRepository<RefreshToken>>();
        services.AddScoped<IGenericRepository<AuditLog>,              GenericRepository<AuditLog>>();
        services.AddScoped<IGenericRepository<EmailActivationToken>,  GenericRepository<EmailActivationToken>>();

        services.AddScoped<IGenericRepository<Plan>,           GenericRepository<Plan>>();
        services.AddScoped<IGenericRepository<PlanHistory>,    GenericRepository<PlanHistory>>();
        services.AddScoped<IGenericRepository<Client>,         GenericRepository<Client>>();
        services.AddScoped<IGenericRepository<Invoice>,        GenericRepository<Invoice>>();
        services.AddScoped<IGenericRepository<Payment>,        GenericRepository<Payment>>();
        services.AddScoped<IGenericRepository<PaymentInvoice>, GenericRepository<PaymentInvoice>>();
        services.AddScoped<IGenericRepository<CreditMovement>, GenericRepository<CreditMovement>>();

        services.AddScoped<IGenericRepository<SupportTicket>,      GenericRepository<SupportTicket>>();
        services.AddScoped<IGenericRepository<TicketNotification>, GenericRepository<TicketNotification>>();
        services.AddScoped<IGenericRepository<TicketComment>,      GenericRepository<TicketComment>>();
        services.AddScoped<IGenericRepository<TicketWorkLog>,      GenericRepository<TicketWorkLog>>();
        services.AddScoped<IGenericRepository<TicketVisit>,            GenericRepository<TicketVisit>>();
        services.AddScoped<IGenericRepository<TicketCannedResponse>,   GenericRepository<TicketCannedResponse>>();
        services.AddScoped<IGenericRepository<SlaPlan>,            GenericRepository<SlaPlan>>();
        services.AddScoped<IGenericRepository<WhatsAppReceipt>,    GenericRepository<WhatsAppReceipt>>();
        services.AddScoped<IGenericRepository<BusinessSchedule>,   GenericRepository<BusinessSchedule>>();
        services.AddScoped<IGenericRepository<ScheduleHoliday>,    GenericRepository<ScheduleHoliday>>();

        services.AddScoped<IGenericRepository<NotifConfig>,             GenericRepository<NotifConfig>>();
        services.AddScoped<IGenericRepository<NotifTemplate>,          GenericRepository<NotifTemplate>>();
        services.AddScoped<IGenericRepository<NotifTemplateHistory>, GenericRepository<NotifTemplateHistory>>();
        services.AddScoped<IGenericRepository<NotifOutbox>,             GenericRepository<NotifOutbox>>();
        services.AddScoped<IGenericRepository<NotifLog>,                GenericRepository<NotifLog>>();
        services.AddScoped<IGenericRepository<NotifSegment>,             GenericRepository<NotifSegment>>();

        services.AddScoped<IGenericRepository<Installation>,           GenericRepository<Installation>>();
        services.AddScoped<IGenericRepository<InstallationTechnician>, GenericRepository<InstallationTechnician>>();
        services.AddScoped<IGenericRepository<VisitTechnician>,        GenericRepository<VisitTechnician>>();
        services.AddScoped<IScheduleRepository, ScheduleRepository>();

        services.AddScoped<IGenericRepository<ClientQr>,          GenericRepository<ClientQr>>();

        services.AddScoped<IGenericRepository<PlanChangeRequest>,  GenericRepository<PlanChangeRequest>>();

        services.AddScoped<IGenericRepository<SystemConfig>,       GenericRepository<SystemConfig>>();

        services.AddScoped<IGenericRepository<InternalAlert>,      GenericRepository<InternalAlert>>();

        services.AddScoped<IGenericRepository<CoverageZone>,       GenericRepository<CoverageZone>>();
        services.AddScoped<IGenericRepository<DistributionBox>,    GenericRepository<DistributionBox>>();
        services.AddScoped<IGenericRepository<CoverageQuery>,      GenericRepository<CoverageQuery>>();
        services.AddScoped<IGenericRepository<GeocodeCache>,       GenericRepository<GeocodeCache>>();

        return services;
    }

    private static IServiceCollection AddServices(
        this IServiceCollection services, IConfiguration config)
    {
        services.AddScoped<IUnitOfWork,        UnitOfWork>();
        services.AddScoped<IPasswordHasher,    BcryptPasswordHasher>();
        services.AddScoped<ISequenceGenerator, SequenceGenerator>();
        services.AddScoped<JwtTokenService>();
        services.AddScoped<AuditService>();
        services.AddScoped<RefreshTokenService>();
        services.AddScoped<AuthService>();
        services.AddScoped<AuditLogService>();

        services.AddScoped<ITbnService, TbnService>();
        services.AddScoped<PlanService>();
        services.AddHttpClient<IWhatsAppNotifier, WhatsAppNotifier>();

        // Email:Provider = "Smtp" (Gmail, envía a cualquier destinatario) o "Resend"
        if (string.Equals(config["Email:Provider"], "Smtp", StringComparison.OrdinalIgnoreCase))
            services.AddScoped<IEmailService, SmtpEmailService>();
        else
            services.AddHttpClient<IEmailService, ResendEmailService>();

        services.AddScoped<IJwtConfiguration, JwtConfigurationOptions>();

        services.AddScoped<BillingService>();
        services.AddScoped<IBillingService>(sp => sp.GetRequiredService<BillingService>());
        services.AddScoped<InvoiceQueryService>();
        services.AddScoped<IInvoiceQueryService>(sp => sp.GetRequiredService<InvoiceQueryService>());
        services.AddHostedService<BillingBackgroundJob>();
        services.AddScoped<InvoiceNumberService>();
        services.AddScoped<IInvoiceNumberService>(sp => sp.GetRequiredService<InvoiceNumberService>());
        services.AddScoped<InvoiceOperationsService>();

        services.AddScoped<PaymentService>();
        services.AddScoped<IPaymentService>(sp => sp.GetRequiredService<PaymentService>());
        services.AddScoped<ICreditLedger, CreditLedgerService>();
        services.AddScoped<PaymentCreditService>();
        services.AddScoped<IPaymentCreditService>(sp => sp.GetRequiredService<PaymentCreditService>());
        services.AddScoped<CashCloseService>();
        services.AddScoped<ICashCloseService>(sp => sp.GetRequiredService<CashCloseService>());
        services.AddScoped<ReceiptImageService>();
        services.AddScoped<IReceiptImageService>(sp => sp.GetRequiredService<ReceiptImageService>());
        services.AddScoped<PaymentQueryService>();
        services.AddScoped<IPaymentQueryService>(sp => sp.GetRequiredService<PaymentQueryService>());
        services.AddScoped<ClientAttachmentService>();
        services.AddScoped<IClientAttachmentService>(sp => sp.GetRequiredService<ClientAttachmentService>());
        services.AddScoped<IGenericRepository<PasswordResetToken>, GenericRepository<PasswordResetToken>>();
        services.AddScoped<TicketNumberService>();
        services.AddScoped<BotProxyService>();
        services.AddScoped<IBotProxyService>(sp => sp.GetRequiredService<BotProxyService>());
        services.AddScoped<BotConfigService>();
        services.AddScoped<IBotConfigService>(sp => sp.GetRequiredService<BotConfigService>());
        services.AddScoped<CompanyQrService>();
        services.AddHttpClient("ChatbotMonitor")
            .ConfigureHttpClient((sp, client) =>
            {
                var cfg = sp.GetRequiredService<IConfiguration>();
                client.BaseAddress = new Uri(cfg["Chatbot:BaseUrl"] ?? "http://chatbot:3001");
                client.Timeout     = TimeSpan.FromSeconds(10);
            });
        services.AddScoped<TicketBalancingService>();
        services.AddScoped<TicketAttachmentService>();
        services.AddScoped<IGenericRepository<TicketAttachment>, GenericRepository<TicketAttachment>>();
        services.AddScoped<ClientHistoryService>();
        services.AddScoped<IGenericRepository<ClientAttachment>, GenericRepository<ClientAttachment>>();
        services.AddScoped<IGenericRepository<CashClose>,       GenericRepository<CashClose>>();
        services.AddScoped<IGenericRepository<PaymentReceipt>,  GenericRepository<PaymentReceipt>>();
        services.AddScoped<IChatbotDirectNotifier, ChatbotDirectNotifier>();

        services.AddScoped<IFileStorage>(sp =>
        {
            var cfg = sp.GetRequiredService<IConfiguration>();
            if (!string.IsNullOrWhiteSpace(cfg["Supabase:Url"]))
                return ActivatorUtilities.CreateInstance<SupabaseFileStorage>(sp);
            return ActivatorUtilities.CreateInstance<LocalFileStorage>(sp);
        });

        services.AddScoped<IExportService, ExportService>();
        services.AddScoped<ICompanyProfileService, CompanyProfileService>();

        services.AddScoped<TicketHelper>();
        services.AddScoped<BusinessScheduleService>();
        services.AddHostedService<SlaAlertJob>();
        services.AddHostedService<AutoCloseTicketJob>();
        services.AddHostedService<AutoSuspendClientJob>();
        services.AddHostedService<SendInstallationRemindersJob>();
        services.AddHostedService<TokenCleanupJob>();


        services.AddScoped<IAdminHubNotifier, AdminHubNotifier>();

        services.AddScoped<INotifPublisher, NotifPublisher>();
        services.AddScoped<INotificationChannel, WhatsAppNotificationChannel>();
        services.AddScoped<NotifContextBuilderService>();
        services.AddScoped<NotifTriggerService>();
        services.AddScoped<NotifTemplateService>();
        services.AddScoped<NotifSegmentService>();
        services.AddScoped<NotifSendService>();
        services.AddScoped<NotifHistoryService>();
        services.AddScoped<NotifConfigService>();

        services.AddScoped<AdminSettingsService>();
        services.AddSingleton<SecretEncryptionService>();

        services.AddScoped<ClientQrService>();
        services.AddHostedService<QrExpiryAlertJob>();
        services.AddHostedService<CompanyQrExpiryAlertJob>();
        services.AddHostedService<ExpirePortReservationsJob>();
        services.AddHostedService<NapPortSyncJob>();

        services.AddScoped<InvoiceProrationService>();
        services.AddHostedService<ApplyScheduledPlanChangesJob>();
        services.AddScoped<PlanChangeService>();
        services.AddScoped<IPlanChangeService>(sp => sp.GetRequiredService<PlanChangeService>());

        services.AddScoped<IInternalAlertService, InternalAlertService>();

        services.AddScoped<ICoverageQueryService, CoverageQueryService>();
        services.AddScoped<IBoxReservationService, BoxReservationService>();
        services.AddScoped<IPortReservationStore, PortReservationStore>();
        services.AddScoped<ICoverageDemandRecorder, CoverageDemandRecorder>();
        services.AddHttpClient<IGeocoder, NominatimGeocoder>();
        services.AddScoped<IAddressGeocodingService, AddressGeocodingService>();
        services.AddScoped<INapPortService, NapPortService>();

        services.AddScoped<ISlotCalculatorService, SlotCalculatorService>();
        services.AddScoped<TechnicianAssignmentService>();
        services.AddScoped<InstallationPhotoService>();

        return services;
    }

    private static IServiceCollection AddValidators(this IServiceCollection services)
    {
        services.AddScoped<IValidator<LoginDto>,          LoginValidator>();
        services.AddScoped<IValidator<CreateUserDto>,     CreateUserValidator>();
        services.AddScoped<IValidator<UpdateUserDto>,     UpdateUserValidator>();
        services.AddScoped<IValidator<ChangePasswordDto>, ChangePasswordValidator>();

        services.AddScoped<IValidator<RegisterClientDto>,  RegisterClientValidator>();
        services.AddScoped<IValidator<UpdateClientDto>,    UpdateClientValidator>();
        services.AddScoped<IValidator<RejectChangeDto>, RejectChangeValidator>();
        services.AddScoped<IValidator<RegisterPaymentDto>, RegisterPaymentValidator>();
        services.AddScoped<IValidator<CreatePlanDto>,      CreatePlanValidator>();
        services.AddScoped<IValidator<UpdatePlanDto>,      UpdatePlanValidator>();

        services.AddScoped<IValidator<CreateTicketDto>,       CreateTicketValidator>();
        services.AddScoped<IValidator<UpdateTicketDto>,       UpdateTicketValidator>();
        services.AddScoped<IValidator<ChangeTicketStatusDto>, ChangeTicketStatusValidator>();
        services.AddScoped<IValidator<AssignTicketDto>,       AssignTicketValidator>();
        services.AddScoped<IValidator<AddCommentDto>,         AddCommentValidator>();
        services.AddScoped<IValidator<AddWorkLogDto>,         AddWorkLogValidator>();
        services.AddScoped<IValidator<ScheduleVisitDto>,      ScheduleVisitValidator>();
        services.AddScoped<IValidator<RescheduleTicketVisitDto>, RescheduleTicketVisitValidator>();

        return services;
    }

    private static IServiceCollection AddMediatRHandlers(this IServiceCollection services)
    {
        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssemblyContaining<TelecomBoliviaNet.Application.Clients.Queries.PeekTbnQuery>();
            cfg.RegisterServicesFromAssemblyContaining<TelecomBoliviaNet.Infrastructure.Data.AppDbContext>();
            cfg.AddBehavior(typeof(IPipelineBehavior<,>), typeof(LoggingBehavior<,>));
        });
        return services;
    }
}
