import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { SessionData, GeminiContent } from '../session/session.service';
import { GeminiClientService } from '../ai/gemini-client.service';
import { PromptBuilderService } from './prompt-builder.service';
import { SentimentService, SentimentLabel } from './sentiment.service';
import { ConversationSummarizerService } from './conversation-summarizer.service';
import { InputSanitizerService } from './input-sanitizer.service';
import { ActionConfirmationGuard } from './guards/action-confirmation.guard';
import { RETRY_POLICY, IRetryPolicy } from '../../common/resilience/retry-policy.interface';
import { Inject } from '@nestjs/common';
import { GeminiRateLimiterService } from '../ai/gemini-rate-limiter.service';
import { GeminiErrorMetricsService } from '../ai/gemini-error-metrics.service';


import { GEMINI_BASE_URL as GEMINI_BASE } from '../../common/constants/app.constants';
import { geminiTelemetry } from '../ai/gemini-telemetry';

export type ToolExecutor = (name: string, args: Record<string, any>) => Promise<any>;

export interface AgentRunOptions {
  /** Callback del registry: ¿alguna herramienta de escritura tuvo éxito en este turno? */
  hasMutationSucceeded?: () => boolean;
  /** FASE G1: ¿alguna herramienta devolvió un resumen de confirmación (pending)? */
  hasPendingConfirmation?: () => boolean;
  /** ¿Alguna herramienta de consulta devolvió el estado que la respuesta describe? */
  hasStateReadBacking?: () => boolean;
  /** ¿Alguna herramienta falló con mensaje propio? Ese mensaje gana. */
  hasToolError?: () => boolean;
}

const CORRECTIVE_INSTRUCTION =
  'ATENCIÓN: Tu respuesta anterior afirma que ejecutaste una acción (agendar, registrar, ' +
  'cerrar, cancelar, actualizar) pero NO llamaste a ninguna herramienta que la realice. ' +
  'Si ya tienes todos los datos necesarios, llama AHORA a la herramienta correspondiente. ' +
  'Si falta algún dato, pídeselo al cliente. NUNCA afirmes que una acción fue realizada sin ejecutarla.';

const UNBACKED_FALLBACK =
  '⚠️ Aún no pude completar esa acción en el sistema. ' +
  '¿Me confirmas los datos necesarios para procesarla correctamente?';

const DEGRADED_RESPONSES = [
  // Ya NO dice "alta demanda" — la mayoría de las veces que se dispara este
  // fallback es un problema técnico puntual (timeout, 429 de cuota), no
  // demanda real, y decirle eso al cliente suena a excusa poco creíble.
  '😔 Tuve un problema técnico procesando tu consulta',
  '😔 No pude generar una respuesta',
  '😔 No pude procesar tu consulta',
  '😔 Tuve un problema procesando tu consulta',
];

/** true si el texto es un fallback de error (no una respuesta real del agente). */
export function isDegradedResponse(text: string): boolean {
  return DEGRADED_RESPONSES.some((d) => text.startsWith(d));
}

@Injectable()
export class AgentService {
  /**
   * Cuánto se insiste por debajo ante un 429 antes de contarle algo al cliente.
   *
   * No es "hasta obtener respuesta" sin más: del otro lado hay alguien mirando
   * WhatsApp. Callado para siempre es peor que un mensaje — el cliente concluye
   * que la empresa lo ignoró, y encima nadie se entera de que falló. 45 s cubre
   * de sobra un pico de cuota (el que medimos se habría resuelto en ~3 s) y
   * sigue estando dentro de lo que alguien espera una respuesta.
   */
  private static readonly PRESUPUESTO_CUOTA_MS = 45_000;

  private readonly logger = new Logger(AgentService.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private readonly chatModel: string;
  private readonly maxTokens: number;
  private readonly maxReactLoops: number;
  private readonly thinkingBudget: number;

  constructor(
    private readonly config:      ConfigService,
    private readonly geminiClient: GeminiClientService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly sentiment:     SentimentService,
    private readonly summarizer:    ConversationSummarizerService,
    private readonly sanitizer:     InputSanitizerService,
    private readonly confirmationGuard: ActionConfirmationGuard,
    @Inject(RETRY_POLICY) private readonly retry: IRetryPolicy,
    private readonly rateLimiter: GeminiRateLimiterService,
    private readonly errorMetrics: GeminiErrorMetricsService,
  ) {
    this.apiKey       = config.get<string>('gemini.apiKey');
    this.chatModel    = config.get<string>('gemini.chatModel') ?? 'gemini-2.5-flash';
    this.maxTokens    = config.get<number>('gemini.maxTokens') ?? 400;
    this.maxReactLoops = config.get<number>('gemini.maxReactLoops') ?? 5;
    // Latencia: gemini-2.5-flash "piensa" por defecto (budget dinámico), lo que
    // añade 10-20 s por turno incluso en mensajes triviales. Lo limitamos.
    this.thinkingBudget = config.get<number>('gemini.thinkingBudget') ?? 0;
    this.http         = axios.create({ timeout: 25_000 });
  }

  buildSystemPrompt(session: SessionData): string {
    return this.promptBuilder.build(session);
  }

  async detectSentiment(text: string, lastBotMessage?: string): Promise<SentimentLabel> {
    return this.sentiment.detect(text, lastBotMessage);
  }

  async summarizeConversation(messages: GeminiContent[]): Promise<string> {
    return this.summarizer.summarize(messages);
  }

  async generateGeneralAnswer(question: string, conversationContext: string): Promise<string> {
    return this.summarizer.generateGeneralAnswer(question, conversationContext);
  }

  async run(
    userMessage: string,
    session: SessionData,
    history: GeminiContent[],
    toolExecutor: ToolExecutor,
    toolDeclarations: object[] = [],
    appendSystemContext?: string,
    options?: AgentRunOptions,
  ): Promise<{ response: string; toolsCalled: string[] }> {
    const startMs    = Date.now();
    const toolsCalled: string[] = [];

    const safeMessage = this.sanitizer.sanitize(userMessage);
    if (this.sanitizer.isLikelyInjection(safeMessage, userMessage)) {
      this.logger.warn(`Blocking likely injection attempt from ${session.phoneNumber}`);
      return {
        response: 'Lo siento, no puedo procesar ese mensaje. Por favor reformula tu consulta.',
        toolsCalled: [],
      };
    }

    const contents: any[] = [
      ...history,
      { role: 'user', parts: [{ text: safeMessage }] },
    ];

    const url         = this.geminiClient.buildUrl(GEMINI_BASE, this.chatModel, 'generateContent', this.apiKey);
    const authHeaders = await this.geminiClient.getAuthHeaders();

    let finalResponse = await this.reactLoop(
      contents, session, appendSystemContext, url, authHeaders,
      toolExecutor, toolDeclarations, toolsCalled, this.maxReactLoops,
    );

    // BUG-1: si la respuesta afirma una acción de escritura que ninguna
    // herramienta mutante respaldó, forzar una iteración correctiva.
    finalResponse = await this.enforceBackedConfirmation(
      finalResponse, contents, session, appendSystemContext, url, authHeaders,
      toolExecutor, toolDeclarations, toolsCalled, options,
    );

    if (!finalResponse) {
      this.logger.warn(`Agente no generó respuesta tras ${this.maxReactLoops} loops`);
      finalResponse = '😔 No pude procesar tu consulta. ¿Puedes reformularla?';
    }

    this.logger.log(JSON.stringify({
      event:          'agent_run',
      durationMs:     Date.now() - startMs,
      toolsCalled,
      responseLength: finalResponse.length,
      sentiment:      session.lastSentiment,
    }));

    return { response: finalResponse, toolsCalled };
  }

  private async reactLoop(
    contents: any[],
    session: SessionData,
    appendSystemContext: string | undefined,
    url: string,
    authHeaders: Record<string, string>,
    toolExecutor: ToolExecutor,
    toolDeclarations: object[],
    toolsCalled: string[],
    maxLoops: number,
  ): Promise<string> {
    // El presupuesto de reintentos por cuota es del TURNO, no de cada llamada.
    // Con hasta `maxLoops` llamadas por turno, darle 30 s a cada una podría
    // dejar al cliente esperando dos minutos y medio sin saber nada.
    const arranqueTurno = Date.now();

    for (let loop = 0; loop < maxLoops; loop++) {
      let geminiResponse: any;
      const restante = AgentService.PRESUPUESTO_CUOTA_MS - (Date.now() - arranqueTurno);

      const systemText = appendSystemContext
        ? `${this.promptBuilder.build(session)}\n\n${appendSystemContext}`
        : this.promptBuilder.build(session);

      try {
        // P3.1 (auditoría 2026-08): token bucket global — espera un token
        // ANTES de intentar la llamada, para no sumar a una ráfaga total
        // (entre TODOS los usuarios) que agote el pool compartido de DSQ.
        await this.rateLimiter.acquire();
        geminiTelemetry.record();
        const res = await this.retry.execute(() => this.http.post(url, {
          system_instruction: {
            parts: [{ text: systemText }],
          },
          contents,
          tools: [{ functionDeclarations: toolDeclarations }],
          tool_config: { function_calling_config: { mode: 'AUTO' } },
          generationConfig: {
            temperature:      0.4,
            maxOutputTokens:  this.maxTokens,
            thinkingConfig:   { thinkingBudget: this.thinkingBudget },
          },
        }, { headers: authHeaders }), {
          label: 'gemini-agent',
          // CORREGIDO: 5 intentos (probado antes) resultó contraproducente
          // con la cuota real del proyecto (baja, ver 429 RESOURCE_EXHAUSTED
          // sostenido en prod) — cada reintento ES una llamada nueva que
          // también se descuenta de esa misma cuota, así que reintentar
          // mucho no ayuda a que responda antes, solo gasta más de lo poco
          // que hay. Con hasta 5 iteraciones de tool-calling por turno
          // (maxReactLoops), 5 intentos cada una podía llegar a 25 llamadas
          // reales por UN solo mensaje del cliente. Con 2 intentos baja a
          // máximo 10 — sigue absorbiendo un hipo breve (un solo reintento)
          // sin multiplicar el daño cuando la cuota está realmente agotada.
          //
          // 2026-08-08: para el 429 de cuota manda el PRESUPUESTO DE TIEMPO del
          // turno, no este contador. La idea es no contarle al cliente un
          // problema que se resuelve solo esperando: se reintenta por debajo
          // mientras quede presupuesto y recién si se agota sale el fallback.
          //
          // Contar tiempo en vez de intentos es lo que hace compatible esto con
          // el razonamiento de arriba: el daño de reintentar no está en el
          // número de intentos sino en la frecuencia. 5 intentos en 2 segundos
          // martillan una cuota agotada; los mismos 5 repartidos en 30 segundos
          // le dan lugar a que se libere.
          maxAttempts: 2,
          baseMs:      500,
          capMs:       4_000,
          quotaBudgetMs: Math.max(0, restante),
        });
        geminiResponse = res.data?.candidates?.[0]?.content;
        this.errorMetrics.recordSuccess();
      } catch (err) {
        this.logger.error(`Gemini error en loop ${loop}: ${(err as any).message} | body: ${JSON.stringify((err as any).response?.data)}`);
        this.errorMetrics.recordError(this.classifyError(err));
        return DEGRADED_RESPONSES[0];
      }

      if (!geminiResponse) {
        this.logger.warn(`Gemini devolvió respuesta vacía en loop ${loop}`);
        return '😔 No pude generar una respuesta. Por favor intenta de nuevo.';
      }

      const parts: any[]          = geminiResponse?.parts ?? [];
      const functionCallParts     = parts.filter(p => p.functionCall);
      const textParts             = parts.filter(p => p.text);

      if (functionCallParts.length === 0) {
        return textParts.map(p => p.text).join('').trim();
      }

      const toolResultParts: any[] = [];
      for (const part of functionCallParts) {
        const { name, args } = part.functionCall;
        toolsCalled.push(name);
        this.logger.debug(`Ejecutando herramienta: ${name} args=${JSON.stringify(args)}`);

        let result: any;
        try {
          result = await toolExecutor(name, args ?? {});
        } catch (err) {
          this.logger.warn(`Error en herramienta ${name}: ${(err as Error).message}`);
          result = { error: `Error ejecutando ${name}: ${(err as Error).message}` };
        }

        toolResultParts.push({
          functionResponse: { name, response: { result } },
        });
      }

      contents.push({ role: 'model', parts });
      contents.push({ role: 'user',  parts: toolResultParts });
    }

    return '';
  }

  private classifyError(err: unknown): 'timeout' | '429' | 'other' {
    const status = (err as any)?.response?.status;
    const code   = (err as any)?.code;
    if (status === 429) return '429';
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'timeout';
    return 'other';
  }

  private async enforceBackedConfirmation(
    finalResponse: string,
    contents: any[],
    session: SessionData,
    appendSystemContext: string | undefined,
    url: string,
    authHeaders: Record<string, string>,
    toolExecutor: ToolExecutor,
    toolDeclarations: object[],
    toolsCalled: string[],
    options?: AgentRunOptions,
  ): Promise<string> {
    const hasMutation = options?.hasMutationSucceeded;
    if (!hasMutation) return finalResponse;

    // FASE G1 (2026-08-07): si alguna herramienta devolvió `pending: true`, la
    // respuesta DEBE describir una acción que todavía no ocurrió — es el
    // resumen del paso 1 que el cliente tiene que confirmar. Aplicar el guard
    // ahí es un falso positivo garantizado: en producción forzó una corrección
    // innecesaria y el cliente leyó "Mil disculpas por la confusión" sin que
    // hubiera habido ninguna.
    if (options?.hasPendingConfirmation?.()) {
      this.logger.debug('Guard omitido: hay un resumen de confirmación pendiente en el turno');
      return finalResponse;
    }
    // Si una herramienta falló y dijo POR QUÉ, esa explicación le sirve al
    // cliente. El fallback genérico es para cuando no hay nada mejor que decir.
    if (options?.hasToolError?.()) {
      this.logger.debug('Guard omitido: una herramienta devolvió un error explicado');
      return finalResponse;
    }

    // HALLAZGO 15 (2026-08-07): la primera version de este respaldo decia
    // "si el cliente tiene CUALQUIER ticket activo, no controles nada
    // descriptivo". Demasiado ancho: con un ticket abierto, un "tu solicitud de
    // cambio de plan quedo registrada" —falso, sin ninguna herramienta detras—
    // pasaba sin correccion, porque el ticket existia pero no tenia nada que
    // ver con la afirmacion.
    //
    // El respaldo tiene que ser ESPECIFICO: solo cuenta si la respuesta cita
    // una referencia concreta (TK-…, TBN-…, INST-…) y la sesion tiene algo
    // activo a lo que esa referencia pueda corresponder.
    const citaReferencia = /\b(TK|TBN|INST)-[\w-]+/i.test(finalResponse);
    const respaldoDeSesion = citaReferencia
      && (!!session.activeTicketId || !!session.activeInstallationId);

    const readBacked = (options?.hasStateReadBacking?.() ?? false) || respaldoDeSesion;
    if (!this.confirmationGuard.isUnbackedConfirmation(finalResponse, hasMutation(), readBacked)) {
      return finalResponse;
    }

    this.logger.warn(JSON.stringify({
      event: 'unbacked_confirmation_detected',
      phone: session.phoneNumber,
      preview: finalResponse.slice(0, 120),
    }));

    contents.push({ role: 'model', parts: [{ text: finalResponse }] });
    contents.push({ role: 'user',  parts: [{ text: CORRECTIVE_INSTRUCTION }] });

    const corrected = await this.reactLoop(
      contents, session, appendSystemContext, url, authHeaders,
      toolExecutor, toolDeclarations, toolsCalled, 2,
    );

    if (corrected && !this.confirmationGuard.isUnbackedConfirmation(corrected, hasMutation(), readBacked)) {
      return corrected;
    }

    this.logger.warn(`Confirmación sin respaldo persistente para ${session.phoneNumber} — degradando a fallback honesto`);
    return UNBACKED_FALLBACK;
  }
}
