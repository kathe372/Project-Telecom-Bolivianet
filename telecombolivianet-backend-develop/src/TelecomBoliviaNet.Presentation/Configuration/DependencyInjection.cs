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
        services.AddScoped<ITicketRepository,           TicketRepository>();
        services.AddScoped<IAuditLogRepository,         AuditLogRepository>();
        services.AddScoped<ITicketVisitRepository,      TicketVisitRepository>();
        services.AddScoped<IInvoiceRepository,          InvoiceRepository>();
        services.AddScoped<IPaymentRepository,          PaymentRepository>();
        services.AddScoped<IClientAttachmentRepository, ClientAttachmentRepository>();
        services.AddScoped<IClientQrRepository,         ClientQrRepository>();
        services.AddScoped<INotifLogRepository,         NotifLogRepository>();
        services.AddScoped<IPlanChangeRequestRepository, PlanChangeRequestRepository>();
        services.AddScoped<ISlaPlanRepository,          SlaPlanRepository>();
        services.AddScoped<ITicketCommentRepository,    TicketCommentRepository>();
        services.AddScoped<ITicketWorkLogRepository,    TicketWorkLogRepository>();
        services.AddScoped<ITicketAttachmentRepository, TicketAttachmentRepository>();

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
        services.AddScoped<IAuthService>(sp => sp.GetRequiredService<AuthService>());
        // F5 — entrar, seguir dentro y cambiar la contraseña son tres cosas.
        services.AddScoped<ISessionService,        SessionService>();
        services.AddScoped<IPasswordChangeService, PasswordChangeService>();
        services.AddScoped<IAuditLogService, AuditLogService>();

        services.AddScoped<ITbnService, TbnService>();
        services.AddScoped<IPlanService, PlanService>();
        // F8.2 — Aviso interno al teléfono del administrador (vencimiento del QR
        // de pago), no un mensaje a un cliente: si un corte de red hiciera llegar
        // el aviso dos veces, no pasa nada; que no llegue, sí. Por eso reintenta
        // también ante fallo de red.
        services.AddHttpClient<IWhatsAppNotifier, WhatsAppNotifier>()
            .ConReintentos(intentosExtra: 3, segundosPorIntento: 10,
                           soloSiElServidorRespondio: false);

        // Email:Provider = "Smtp" (Gmail, envía a cualquier destinatario) o "Resend"
        if (string.Equals(config["Email:Provider"], "Smtp", StringComparison.OrdinalIgnoreCase))
            services.AddScoped<IEmailService, SmtpEmailService>();
        else
            // F8.2 — Correo a una persona: recuperar contraseña, activar cuenta.
            // Solo se reintenta si Resend contestó que rechazó el envío. Ante un
            // timeout no se repite: no hay forma de saber si el correo ya salió,
            // y dos enlaces de recuperación en la bandeja de alguien es peor que
            // un error visible.
            services.AddHttpClient<IEmailService, ResendEmailService>()
                .ConReintentos(intentosExtra: 2, segundosPorIntento: 10,
                               soloSiElServidorRespondio: true);

        services.AddScoped<IJwtConfiguration, JwtConfigurationOptions>();

        services.AddScoped<BillingService>();
        services.AddScoped<IBillingService>(sp => sp.GetRequiredService<BillingService>());
        // F5 — lo que BillingService hacía además de facturar el mes.
        services.AddScoped<IInvoiceBackfillService, InvoiceBackfillService>();
        // F5 — los cobros del alta salen de RegisterClientHandler.
        services.AddScoped<IInitialChargesService,  InitialChargesService>();
        services.AddScoped<IInvoiceStatusService,   InvoiceStatusService>();
        // F5 — InvoiceQueryService eran 419 líneas: totales, grilla y tres informes.
        services.AddScoped<IInvoiceQueryService,  InvoiceQueryService>();
        services.AddScoped<IInvoiceStatsService,  InvoiceStatsService>();
        services.AddScoped<IInvoiceReportService, InvoiceReportService>();
        services.AddHostedService<BillingBackgroundJob>();
        services.AddScoped<InvoiceNumberService>();
        services.AddScoped<IInvoiceNumberService>(sp => sp.GetRequiredService<InvoiceNumberService>());
        services.AddScoped<IInvoiceOperationsService,   InvoiceOperationsService>();
        // F5 — crear cargos y aplicar crédito salen del cajón de "operaciones".
        services.AddScoped<IExtraordinaryInvoiceService, ExtraordinaryInvoiceService>();
        services.AddScoped<IInvoiceCreditService,        InvoiceCreditService>();

        services.AddScoped<CreditReversalCalculator>();
        services.AddScoped<PaymentService>();
        services.AddScoped<IPaymentService>(sp => sp.GetRequiredService<PaymentService>());
        // F5 — las otras tres cuartas partes de lo que era PaymentService.
        services.AddScoped<IPaymentQueryService,   PaymentQueryService>();
        services.AddScoped<IPaymentReportService,  PaymentReportService>();
        services.AddScoped<IOverdueReminderService, OverdueReminderService>();
        services.AddScoped<ICreditLedger, CreditLedgerService>();
        services.AddScoped<PaymentAllocator>();
        services.AddScoped<IPaymentCreditService, PaymentCreditService>();
        services.AddScoped<ICreditRefundService,  CreditRefundService>();
        services.AddScoped<CashCloseService>();
        services.AddScoped<ICashCloseService>(sp => sp.GetRequiredService<CashCloseService>());
        services.AddScoped<ReceiptImageService>();
        services.AddScoped<IReceiptImageService>(sp => sp.GetRequiredService<ReceiptImageService>());
        services.AddScoped<IClientAttachmentService, ClientAttachmentService>();
        services.AddScoped<TicketNumberService>();
        // F5 — lo construía a mano CreateInstallationHandler, que arrastraba
        // cuatro dependencias solo para eso.
        services.AddScoped<CreateInstallationValidator>();
        // F5 — una interfaz de once métodos donde cuatro de sus cinco
        // consumidores usaban exactamente uno.
        services.AddScoped<IBotMonitorProxy,  BotMonitorProxy>();
        services.AddScoped<IBotRagProxy,      BotRagProxy>();
        services.AddScoped<IBotOutboundProxy, BotOutboundProxy>();
        services.AddScoped<IBotConfigService, BotConfigService>();
        services.AddScoped<CompanyQrService>();
        // F8.2 — SIN reintentos, a propósito: ChatbotDirectNotifier ya cae al
        // notifier con plantilla si esto falla. Ver HttpResilience.
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
        // F5 — pedir, resolver, consultar y avisar dejan de ser la misma clase.
        services.AddScoped<PlanChangeNotifier>();
        services.AddScoped<IPlanChangeRequestService, PlanChangeRequestService>();
        services.AddScoped<IPlanChangeQueryService,   PlanChangeQueryService>();

        services.AddScoped<IInternalAlertService, InternalAlertService>();

        services.AddScoped<ICoverageQueryService, CoverageQueryService>();
        services.AddScoped<IBoxReservationService, BoxReservationService>();
        services.AddScoped<IPortReservationStore, PortReservationStore>();
        services.AddScoped<ICoverageDemandRecorder, CoverageDemandRecorder>();
        // F8.2 — Una lectura, sin efecto en el mundo: se puede repetir sin
        // pensarlo. Pocos intentos y con espera creciente a propósito, porque
        // Nominatim es un servicio público que limita a una consulta por segundo
        // y bloquea a quien insiste.
        services.AddHttpClient<IGeocoder, NominatimGeocoder>()
            .ConReintentos(intentosExtra: 2, segundosPorIntento: 5,
                           soloSiElServidorRespondio: false);
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
