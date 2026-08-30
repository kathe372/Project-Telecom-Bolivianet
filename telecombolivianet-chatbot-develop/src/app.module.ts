import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';

import {
  appConfig, databaseConfig, redisConfig, sistemaConfig,
  metaConfig, geminiConfig, ragConfig, storageConfig, botConfig,
  rateLimitConfig, validateConfig,
} from './config/app.config';

import { Conversation } from './database/entities/conversation.entity';
import { Message } from './database/entities/message.entity';
import { KnowledgeDocument, KnowledgeChunk } from './database/entities/knowledge.entity';
import { BotEvent } from './database/entities/bot-event.entity';

import { DatabaseMigrationService } from './database/database-migration.service';

import { SessionService } from './modules/session/session.service';
import { SistemaApiService } from './modules/client/sistema-api.service';
import {
  CLIENT_REPOSITORY, TICKET_REPOSITORY, PLAN_REPOSITORY,
  INSTALLATION_REPOSITORY, PAYMENT_REPOSITORY,
  NOTIFICATION_REPOSITORY, BOT_CONFIG_REPOSITORY,
} from './modules/client/sistema-api.interfaces';
import { WhatsappApiService } from './modules/whatsapp/whatsapp-api.service';
import { WhatsappMockService } from './modules/whatsapp/whatsapp-mock.service';
import { WHATSAPP_MESSENGER } from './modules/whatsapp/whatsapp-messenger.interface';
import { WhatsappOutboxService } from './modules/whatsapp/whatsapp-outbox.service';
import { OutboxRepositoryService } from './modules/whatsapp/outbox-repository.service';
import { WebhookDedupService } from './modules/whatsapp/webhook-dedup.service';
import { RagService } from './modules/rag/rag.service';
import { SemanticCacheService } from './modules/rag/semantic-cache.service';
import { EmbeddingService } from './modules/rag/embedding.service';
import { ChunkVectorRepository } from './modules/rag/chunk-vector.repository';
import { RagAnswerGenerator } from './modules/rag/rag-answer.generator';
import { TextChunker } from './modules/rag/text-chunker';
import { DocumentIndexer } from './modules/rag/document-indexer.service';
import { CsatRecorderService } from './modules/bot/csat-recorder.service';
import { ProcedureRunnerService } from './modules/bot/procedure-runner.service';
import { ProcedureActionsService } from './modules/bot/procedure-actions.service';
import { BotOrchestratorService } from './modules/bot/bot-orchestrator.service';
import { AgentService } from './modules/bot/agent.service';
import { PromptBuilderService } from './modules/bot/prompt-builder.service';
import { SentimentService } from './modules/bot/sentiment.service';
import { SentimentHeuristic } from './modules/bot/sentiment/sentiment-heuristic';
import { ConversationSummarizerService } from './modules/bot/conversation-summarizer.service';
import { PROMPT_SECTIONS } from './modules/bot/prompt-sections/prompt-section.interface';
import { PersonalitySection } from './modules/bot/prompt-sections/personality.section';
import { ClientInfoSection } from './modules/bot/prompt-sections/client-info.section';
import { SentimentHintSection } from './modules/bot/prompt-sections/sentiment-hint.section';
import { EscalationRulesSection } from './modules/bot/prompt-sections/escalation-rules.section';
import { GeneralInstructionsSection } from './modules/bot/prompt-sections/general-instructions.section';
import { TechSupportFlowSection } from './modules/bot/prompt-sections/tech-support-flow.section';
import { InstallationFlowSection } from './modules/bot/prompt-sections/installation-flow.section';
import { SuspensionCheckSection } from './modules/bot/prompt-sections/suspension-check.section';
import { AgentToolRegistry } from './modules/bot/tools/agent-tool-registry.service';
import { AGENT_TOOLS } from './modules/bot/tools/agent-tool.interface';
import { GetClientDebtTool } from './modules/bot/tools/get-client-debt.tool';
import { ExplainInvoiceDifferenceTool } from './modules/bot/tools/explain-invoice-difference.tool';
import { InvoiceDiscrepancyExplainer } from './modules/bot/domain/invoice-discrepancy-explainer';
import { SendPaymentQrTool } from './modules/bot/tools/send-payment-qr.tool';
import { CreateSupportTicketTool } from './modules/bot/tools/create-support-ticket.tool';
import { CheckRecurringIssueTool } from './modules/bot/tools/check-recurring-issue.tool';
import { GetTicketVisitSlotsTool } from './modules/bot/tools/get-ticket-visit-slots.tool';
import { ScheduleTicketVisitTool } from './modules/bot/tools/schedule-ticket-visit.tool';
import { RescheduleTicketTool } from './modules/bot/tools/reschedule-ticket.tool';
import { CheckCoverageTool } from './modules/bot/tools/check-coverage.tool';
import { GetInstallationSlotsTool } from './modules/bot/tools/get-installation-slots.tool';
import { SearchKnowledgeBaseTool } from './modules/bot/tools/search-knowledge-base.tool';
import { CreateInstallationTool } from './modules/bot/tools/create-installation.tool';
import { CloseSupportTicketTool } from './modules/bot/tools/close-support-ticket.tool';
import { ChangePlanTool } from './modules/bot/tools/change-plan.tool';
import { GetAvailablePlansTool } from './modules/bot/tools/get-available-plans.tool';
import { EscalateToAgentTool } from './modules/bot/tools/escalate-to-agent.tool';
import { CancelInstallationTool } from './modules/bot/tools/cancel-installation.tool';
import { RescheduleInstallationTool } from './modules/bot/tools/reschedule-installation.tool';
import { GetActiveTicketTool } from './modules/bot/tools/get-active-ticket.tool';
import { GetActiveInstallationTool } from './modules/bot/tools/get-active-installation.tool';
import { UpdateTicketTool } from './modules/bot/tools/update-ticket.tool';
import { ReopenSupportTicketTool } from './modules/bot/tools/reopen-support-ticket.tool';
import { ShowMainMenuTool } from './modules/bot/tools/show-main-menu.tool';
import { MainMenuService } from './modules/bot/main-menu.service';
import { AccountChoiceService } from './modules/bot/account-choice.service';
import { EscalationService } from './modules/bot/turn/escalation.service';
import { ImagenSinPieHandler } from './modules/bot/turn/imagen-sin-pie.handler';
import { EleccionDeCuentaPendienteHandler } from './modules/bot/turn/eleccion-de-cuenta.handler';
import { SaludoYPrimerContactoHandler } from './modules/bot/turn/saludo-y-primer-contacto.handler';
import { GetInstallationPlansTool } from './modules/bot/tools/get-installation-plans.tool';
import { SaveProspectDataTool } from './modules/bot/tools/save-prospect-data.tool';
import { InteractiveIdCodec } from './modules/bot/intents/interactive-id.codec';
import { CsatFlowSection } from './modules/bot/prompt-sections/csat-flow.section';
import { PreviousContextSection } from './modules/bot/prompt-sections/previous-context.section';
import { AudioTranscriberService } from './modules/bot/audio-transcriber.service';
import { MessageFormatterService } from './modules/bot/message-formatter.service';
import { BotConfigCacheService } from './modules/bot/bot-config-cache.service';
import { AdminSignalrNotifierService } from './modules/notifications/admin-signalr-notifier.service';
import { GeminiWarmupService } from './modules/bot/ollama-warmup.service';
import { BillingJobsCompatService } from './modules/bot/billing-jobs-compat.service';
import { GeminiClientService } from './modules/ai/gemini-client.service';
import { GeminiRateLimiterService } from './modules/ai/gemini-rate-limiter.service';
import { GeminiErrorMetricsService } from './modules/ai/gemini-error-metrics.service';
import { MediaStorageService } from './modules/media/media-storage.service';
import { NominatimService } from './modules/coverage/nominatim.service';
import { GoogleMapsLinkResolverService } from './modules/coverage/google-maps-link-resolver.service';
import { CoverageService } from './modules/coverage/coverage.service';
import { CoverageMessageResolver } from './modules/coverage/coverage-message.resolver';
import { COVERAGE_REPOSITORY } from './modules/coverage/coverage.interfaces';

import { WhatsappWebhookController } from './modules/whatsapp/whatsapp-webhook.controller';
import { SimulatorController } from './modules/whatsapp/simulator.controller';
import { AdminNotifyController } from './modules/admin/admin-notify.controller';
import { HealthController } from './modules/bot/health.controller';
import { HealthService } from './modules/bot/health.service';
import { MonitorController } from './modules/admin/monitor.controller';
import { RagDocumentsController } from './modules/rag/rag-documents.controller';

import { PhoneRateLimiterMiddleware } from './common/middleware/phone-rate-limiter.middleware';

import { InputSanitizerService } from './modules/bot/input-sanitizer.service';
import { ActionConfirmationGuard } from './modules/bot/guards/action-confirmation.guard';
import { RETRY_POLICY } from './common/resilience/retry-policy.interface';
import { ExponentialBackoffPolicy } from './common/resilience/exponential-backoff.policy';
import { FirstContactPolicy } from './modules/bot/pipeline/first-contact.policy';
import { PlanChangeEffectivityPolicy } from './modules/bot/domain/plan-change-effectivity';
import { InternalTokenGuard } from './common/guards/internal-token.guard';
import { GetConversationsUseCase } from './modules/monitoring/use-cases/get-conversations.use-case';
import { BotEventRecorderService } from './modules/monitoring/bot-event-recorder.service';
import { BotMetricsService } from './modules/monitoring/bot-metrics.service';
import { ConversationSummaryJob } from './modules/monitoring/conversation-summary.job';
import { ConversationMemoryService } from './modules/monitoring/conversation-memory.service';
import { ProcessingIndicatorService } from './modules/bot/processing-indicator.service';
import { InteractiveReplyBuilder } from './modules/bot/interactive-reply.builder';
import { InteractiveIntentMapperService } from './modules/bot/intents/interactive-intent-mapper.service';
import { INTENT_MAPPER, INTENT_MAP_CONFIG } from './modules/bot/intents/intent-mapper.interface';
import { DEFAULT_INTENT_MAP } from './modules/bot/intents/intent-map.config';
import { TypeOrmConversationStore } from './modules/conversation/adapters/typeorm-conversation-store';
import { CONVERSATION_STORE } from './modules/conversation/ports/conversation-store.port';

import { MESSAGE_PIPELINE } from './modules/bot/pipeline/message-handler';
import { MessagePersistenceService } from './modules/bot/pipeline/message-persistence.service';
import { MessageSenderService } from './modules/bot/pipeline/message-sender.service';
import { MarkAsReadHandler } from './modules/bot/pipeline/mark-as-read.handler';
import { SessionLoadHandler } from './modules/bot/pipeline/session-load.handler';
import { MediaDownloadHandler } from './modules/bot/pipeline/media-download.handler';
import { EscalationCheckHandler } from './modules/bot/pipeline/escalation-check.handler';
import { MessagePersistHandler } from './modules/bot/pipeline/message-persist.handler';
import { HumanAvailabilityHandler } from './modules/bot/pipeline/human-availability.handler';
import { ClientIdentificationHandler } from './modules/bot/pipeline/client-identification.handler';
import { DebounceHandler } from './modules/bot/pipeline/debounce.handler';

const IS_MOCK = process.env.WHATSAPP_MOCK === 'true';

const whatsappProvider = IS_MOCK
  ? [
      WhatsappMockService,
      { provide: WHATSAPP_MESSENGER, useExisting: WhatsappMockService },
      { provide: WhatsappApiService, useExisting: WhatsappMockService },
    ]
  : [
      WhatsappApiService,
      { provide: WHATSAPP_MESSENGER, useExisting: WhatsappApiService },
    ];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
      load: [
        appConfig, databaseConfig, redisConfig, sistemaConfig,
        metaConfig, geminiConfig, ragConfig, storageConfig, botConfig,
        rateLimitConfig,
      ],
    }),

    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        timeout: cfg.get<number>('app.httpTimeoutMs') ?? 10000,
        maxRedirects: 3,
      }),
    }),

    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('database.host'),
        port: cfg.get('database.port'),
        username: cfg.get('database.username'),
        password: cfg.get('database.password'),
        database: cfg.get('database.database'),
        entities: [Conversation, Message, KnowledgeDocument, KnowledgeChunk, BotEvent],
        synchronize: cfg.get('database.synchronize'),
        logging: cfg.get('database.logging'),
        extra: { max: 20, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 2_000 },
      }),
    }),

    TypeOrmModule.forFeature([Conversation, Message, KnowledgeDocument, KnowledgeChunk, BotEvent]),
  ],

  controllers: [
    WhatsappWebhookController,
    ...(IS_MOCK ? [SimulatorController] : []),
    AdminNotifyController,
    HealthController,
    MonitorController,
    RagDocumentsController,
  ],

  providers: [
    DatabaseMigrationService,
    SessionService,
    SistemaApiService,
    { provide: CLIENT_REPOSITORY,       useExisting: SistemaApiService },
    { provide: TICKET_REPOSITORY,       useExisting: SistemaApiService },
    { provide: PLAN_REPOSITORY,         useExisting: SistemaApiService },
    { provide: INSTALLATION_REPOSITORY, useExisting: SistemaApiService },
    { provide: PAYMENT_REPOSITORY,      useExisting: SistemaApiService },
    { provide: NOTIFICATION_REPOSITORY, useExisting: SistemaApiService },
    { provide: BOT_CONFIG_REPOSITORY,   useExisting: SistemaApiService },
    { provide: COVERAGE_REPOSITORY,     useExisting: SistemaApiService },

    NominatimService,
    GoogleMapsLinkResolverService,
    CoverageService,
    CoverageMessageResolver,

    ...whatsappProvider,
    OutboxRepositoryService,
    WhatsappOutboxService,
    WebhookDedupService,

    GeminiClientService,
    GeminiRateLimiterService,
    GeminiErrorMetricsService,
    SentimentService,
    SentimentHeuristic,
    ConversationSummarizerService,

    PersonalitySection,
    ClientInfoSection,
    SuspensionCheckSection,
    SentimentHintSection,
    EscalationRulesSection,
    GeneralInstructionsSection,
    TechSupportFlowSection,
    InstallationFlowSection,
    CsatFlowSection,
    PreviousContextSection,
    {
      provide: PROMPT_SECTIONS,
      useFactory: (
        personality:     PersonalitySection,
        clientInfo:      ClientInfoSection,
        suspensionCheck: SuspensionCheckSection,
        sentimentHint:   SentimentHintSection,
        escalation:      EscalationRulesSection,
        instructions:    GeneralInstructionsSection,
        techSupport:     TechSupportFlowSection,
        installation:    InstallationFlowSection,
        csatFlow:        CsatFlowSection,
        previousContext: PreviousContextSection,
      ) => [
        personality, clientInfo, suspensionCheck, sentimentHint,
        escalation, instructions, techSupport, installation, csatFlow,
        previousContext,
      ],
      inject: [
        PersonalitySection, ClientInfoSection, SuspensionCheckSection,
        SentimentHintSection, EscalationRulesSection, GeneralInstructionsSection,
        TechSupportFlowSection, InstallationFlowSection,
        CsatFlowSection, PreviousContextSection,
      ],
    },
    PromptBuilderService,

    InputSanitizerService,
    ActionConfirmationGuard,
    ExponentialBackoffPolicy,
    { provide: RETRY_POLICY, useExisting: ExponentialBackoffPolicy },
    FirstContactPolicy,
    PlanChangeEffectivityPolicy,
    InternalTokenGuard,
    GetConversationsUseCase,
    BotEventRecorderService,
    BotMetricsService,
    ConversationSummaryJob,
    ConversationMemoryService,
    ProcessingIndicatorService,
    InteractiveReplyBuilder,
    TypeOrmConversationStore,
    { provide: CONVERSATION_STORE, useExisting: TypeOrmConversationStore },
    InteractiveIntentMapperService,
    { provide: INTENT_MAP_CONFIG,  useValue: DEFAULT_INTENT_MAP },
    { provide: INTENT_MAPPER,      useExisting: InteractiveIntentMapperService },
    InteractiveIdCodec,

    AgentService,

    GetClientDebtTool,
    SendPaymentQrTool,
    CreateSupportTicketTool,
    RescheduleTicketTool,
    CheckCoverageTool,
    GetInstallationSlotsTool,
    SearchKnowledgeBaseTool,
    CreateInstallationTool,
    CloseSupportTicketTool,
    ChangePlanTool,
    GetAvailablePlansTool,
    EscalateToAgentTool,
    CancelInstallationTool,
    RescheduleInstallationTool,
    GetActiveTicketTool,
    GetActiveInstallationTool,
    UpdateTicketTool,
    ReopenSupportTicketTool,
    InvoiceDiscrepancyExplainer,
    ExplainInvoiceDifferenceTool,
    MainMenuService,
    AccountChoiceService,
    // E-05 — Las decisiones que salieron de processCoreLogic.
    EscalationService,
    ImagenSinPieHandler,
    EleccionDeCuentaPendienteHandler,
    SaludoYPrimerContactoHandler,
    ShowMainMenuTool,
    GetInstallationPlansTool,
    CheckRecurringIssueTool,
    GetTicketVisitSlotsTool,
    ScheduleTicketVisitTool,
    SaveProspectDataTool,
    {
      provide: AGENT_TOOLS,
      useFactory: (
        t1:  GetClientDebtTool,
        t2:  SendPaymentQrTool,
        t3:  CreateSupportTicketTool,
        t4:  RescheduleTicketTool,
        t5:  CheckCoverageTool,
        t6:  GetInstallationSlotsTool,
        t7:  SearchKnowledgeBaseTool,
        t8:  CreateInstallationTool,
        t9:  CloseSupportTicketTool,
        t10: ChangePlanTool,
        t11: GetAvailablePlansTool,
        t12: EscalateToAgentTool,
        t13: CancelInstallationTool,
        t14: RescheduleInstallationTool,
        t15: GetActiveTicketTool,
        t16: UpdateTicketTool,
        t17: ReopenSupportTicketTool,
        t18: ExplainInvoiceDifferenceTool,
        t19: ShowMainMenuTool,
        t20: GetInstallationPlansTool,
        t21: CheckRecurringIssueTool,
        t22: GetTicketVisitSlotsTool,
        t23: ScheduleTicketVisitTool,
        t24: SaveProspectDataTool,
        t25: GetActiveInstallationTool,
      ) => [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14, t15, t16, t17, t18, t19, t20, t21, t22, t23, t24, t25],
      inject: [
        GetClientDebtTool,          SendPaymentQrTool,          CreateSupportTicketTool,
        RescheduleTicketTool,       CheckCoverageTool,          GetInstallationSlotsTool,
        SearchKnowledgeBaseTool,    CreateInstallationTool,     CloseSupportTicketTool,
        ChangePlanTool,             GetAvailablePlansTool,      EscalateToAgentTool,
        CancelInstallationTool,     RescheduleInstallationTool, GetActiveTicketTool,
        UpdateTicketTool,           ReopenSupportTicketTool,    ExplainInvoiceDifferenceTool,
        ShowMainMenuTool,           GetInstallationPlansTool,   CheckRecurringIssueTool,
        GetTicketVisitSlotsTool,    ScheduleTicketVisitTool,    SaveProspectDataTool,
        GetActiveInstallationTool,
      ],
    },
    AgentToolRegistry,

    AudioTranscriberService,
    MessageFormatterService,
    BotConfigCacheService,
    CsatRecorderService,
    ProcedureRunnerService,
    ProcedureActionsService,
    BotOrchestratorService,
    GeminiWarmupService,
    BillingJobsCompatService,
    HealthService,

    SemanticCacheService,
    EmbeddingService,
    ChunkVectorRepository,
    RagAnswerGenerator,
    TextChunker,
    DocumentIndexer,
    RagService,
    AdminSignalrNotifierService,
    MediaStorageService,

    MessagePersistenceService,
    MessageSenderService,
    MarkAsReadHandler,
    SessionLoadHandler,
    DebounceHandler,
    MediaDownloadHandler,
    EscalationCheckHandler,
    MessagePersistHandler,
    HumanAvailabilityHandler,
    ClientIdentificationHandler,
    {
      provide: MESSAGE_PIPELINE,
      useFactory: (
        markAsRead:        MarkAsReadHandler,
        sessionLoad:       SessionLoadHandler,
        debounce:          DebounceHandler,
        mediaDownload:     MediaDownloadHandler,
        escalation:        EscalationCheckHandler,
        persist:           MessagePersistHandler,
        humanAvailability: HumanAvailabilityHandler,
        clientId:          ClientIdentificationHandler,
      ) => [markAsRead, sessionLoad, debounce, mediaDownload, escalation, persist, humanAvailability, clientId],
      inject: [
        MarkAsReadHandler, SessionLoadHandler, DebounceHandler, MediaDownloadHandler,
        EscalationCheckHandler, MessagePersistHandler, HumanAvailabilityHandler,
        ClientIdentificationHandler,
      ],
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(PhoneRateLimiterMiddleware)
      .forRoutes({ path: 'webhook', method: RequestMethod.POST });
  }
}
