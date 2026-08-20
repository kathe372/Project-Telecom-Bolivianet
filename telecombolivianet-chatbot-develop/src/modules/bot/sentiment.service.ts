import { Inject, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { GeminiClientService } from '../ai/gemini-client.service';
import { ConfigService } from '@nestjs/config';
import { RETRY_POLICY, IRetryPolicy } from '../../common/resilience/retry-policy.interface';
import { SentimentHeuristic } from './sentiment/sentiment-heuristic';


import { GEMINI_BASE_URL as GEMINI_BASE } from '../../common/constants/app.constants';
import { geminiTelemetry } from '../ai/gemini-telemetry';

export type SentimentLabel = 'neutral' | 'frustrated' | 'angry' | 'happy';
const VALID_LABELS: readonly SentimentLabel[] = ['neutral', 'frustrated', 'angry', 'happy'];

@Injectable()
export class SentimentService {
  private readonly logger = new Logger(SentimentService.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly geminiClient: GeminiClientService,
    @Inject(RETRY_POLICY) private readonly retry: IRetryPolicy,
    private readonly heuristic: SentimentHeuristic,
  ) {
    this.apiKey = config.get<string>('gemini.apiKey');
    // Opt-C: modelo liviano — el sentimiento es trivial, no necesita el modelo
    // grande; y usar otro modelo reparte carga fuera del pool congestionado de
    // 2.5-flash (menos 429).
    this.model  = config.get<string>('gemini.lightModel') ?? 'gemini-2.5-flash-lite';
    this.http   = axios.create({ timeout: 10000 });
  }

  async detect(
    text: string,
    lastBotMessage?: string,
  ): Promise<SentimentLabel> {
    // Opt-A: reglas locales primero; solo los mensajes ambiguos gastan una
    // llamada a Gemini (la mayoría de mensajes de atención no lo son).
    const quick = this.heuristic.classify(text);
    if (quick !== null) return quick;

    if (!this.apiKey && !this.geminiClient.isUsingOAuth()) return 'neutral';
    try {
      const url     = this.geminiClient.buildUrl(GEMINI_BASE, this.model, 'generateContent', this.apiKey);
      const headers = await this.geminiClient.getAuthHeaders();

      const contextLine = lastBotMessage
        ? `Contexto: el bot acaba de preguntar: "${lastBotMessage.substring(0, 120)}"\n`
        : '';

      const prompt =
        `${contextLine}` +
        `Clasifica el sentimiento del CLIENTE con UNA sola palabra (neutral/frustrated/angry/happy).\n` +
        `Si el mensaje es una respuesta corta a una pregunta cerrada (ej: "no", "sí", "ok"), clasifica como neutral.\n` +
        `Mensaje del cliente: "${text.substring(0, 200)}"`;

      geminiTelemetry.record();
      const res = await this.retry.execute(() => this.http.post(url, {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // A5: los modelos 2.5 "piensan" por defecto y esto corre en cada
        // mensaje ambiguo — se desactiva igual que en AgentService.
        generationConfig: { temperature: 0, maxOutputTokens: 5, thinkingConfig: { thinkingBudget: 0 } },
      }, { headers }), { label: 'gemini-sentiment', maxAttempts: 2 });

      const raw = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() ?? '';
      if (!VALID_LABELS.includes(raw as SentimentLabel)) {
        this.logger.warn(JSON.stringify({
          event: 'sentiment_unexpected_label', model: this.model, raw: raw.slice(0, 40),
        }));
        return 'neutral';
      }
      return raw as SentimentLabel;
    } catch (err) {
      // FASE B1 (2026-08-07): acá había un `catch { return 'neutral'; }` mudo,
      // y 'neutral' es indistinguible de "el cliente está tranquilo".
      // Evidencia de producción: 285 turnos neutral, 2 angry (explicables por
      // la heurística local) y CERO 'frustrated'/'happy' en dos semanas —
      // etiquetas que solo puede producir el LLM. Es decir, no hay una sola
      // señal de que esta llamada haya funcionado alguna vez. Usa el mismo
      // modelo liviano que el resumidor, que falla 57 de 58 veces.
      this.logger.warn(JSON.stringify({
        event:   'sentiment_failed',
        model:   this.model,
        status:  (err as any)?.response?.status ?? null,
        apiCode: (err as any)?.response?.data?.error?.status ?? null,
        message: (err as Error).message,
        detail:  JSON.stringify((err as any)?.response?.data ?? {}).slice(0, 300),
      }));
      return 'neutral';
    }
  }
}
