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
        // Registro ABIERTO: cualquier IGenericRepository<T> se resuelve sin tocar
        // este archivo.
        //
        // Antes había 44 registros manuales, uno por entidad, y añadir una nueva
        // obligaba a editar aquí — violación directa de Open/Closed. Peor: la lista
        // se había quedado corta. DashboardPreference, NapPort y PortReservation
        // NO estaban registradas, así que inyectar su repositorio habría reventado
        // en tiempo de ejecución. Lo detectó DependencyResolutionTests, que
        // recorre el modelo de EF en vez de fiarse de una lista escrita a mano.
        services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));

        // Repositorios ESPECÍFICOS por agregado (F4 · ADR-001).
        //
        // Exponen las consultas con nombre de negocio en vez de obligar a la capa
        // Application a encadenar GetAll().Include(...).Where(...), que es lo que
        // arrastraba EF Core hasta los casos de uso.
        //
        // Van DESPUÉS del registro abierto a propósito: el último registro para un
        // mismo tipo de servicio es el que gana, así que estos ganan sobre el
        // genérico cuando alguien pide la interfaz específica.
        services.AddScoped<IScheduleRepository,          ScheduleRepository>();
        services.AddScoped<IClientRepository,            ClientRepository>();
        services.AddScoped<IInstallationRepository,      InstallationRepository>();
        services.AddScoped<IDistributionBoxRepository,   DistributionBoxRepository>();
        services.AddScoped<IUserRepository,             UserRepository>();

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
        services.AddScoped<IAuditLogService, AuditLogService>();

        services.AddScoped<ITbnService, TbnService>();
        services.AddScoped<IPlanService, PlanService>();
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
        services.AddScoped<IInvoiceOperationsService, InvoiceOperationsService>();

        services.AddScoped<PaymentService>();
        services.AddScoped<IPaymentService>(sp => sp.GetRequiredService<PaymentService>());
        services.AddScoped<ICreditLedger, CreditLedgerService>();
        services.AddScoped<IPaymentCreditService, PaymentCreditService>();
        services.AddScoped<CashCloseService>();
        services.AddScoped<ICashCloseService>(sp => sp.GetRequiredService<CashCloseService>());
        services.AddScoped<ReceiptImageService>();
        services.AddScoped<IReceiptImageService>(sp => sp.GetRequiredService<ReceiptImageService>());
        services.AddScoped<PaymentQueryService>();
        services.AddScoped<IPaymentQueryService>(sp => sp.GetRequiredService<PaymentQueryService>());
        services.AddScoped<IClientAttachmentService, ClientAttachmentService>();
        services.AddScoped<TicketNumberService>();
        services.AddScoped<IBotProxyService, BotProxyService>();
        services.AddScoped<IBotConfigService, BotConfigService>();
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
        services.AddScoped<IClientHistoryService, ClientHistoryService>();
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
        services.AddScoped<IBusinessScheduleService, BusinessScheduleService>();
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

        services.AddScoped<IAdminSettingsService, AdminSettingsService>();
        services.AddSingleton<SecretEncryptionService>();

        services.AddScoped<IClientQrService, ClientQrService>();
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
        services.AddScoped<IInstallationPhotoService, InstallationPhotoService>();

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
