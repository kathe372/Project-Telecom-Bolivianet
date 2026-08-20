import { Inject, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import { GeminiClientService } from '../ai/gemini-client.service';
import { GeminiContent } from '../session/session.service';
import { RETRY_POLICY, IRetryPolicy } from '../../common/resilience/retry-policy.interface';


import { GEMINI_BASE_URL as GEMINI_BASE } from '../../common/constants/app.constants';
import { geminiTelemetry } from '../ai/gemini-telemetry';

@Injectable()
export class ConversationSummarizerService {
  private readonly logger = new Logger(ConversationSummarizerService.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private readonly chatModel: string;
  private readonly lightModel: string;

  constructor(
    private readonly config: ConfigService,
    private readonly geminiClient: GeminiClientService,
    @Inject(RETRY_POLICY) private readonly retry: IRetryPolicy,
  ) {
    this.apiKey     = config.get<string>('gemini.apiKey');
    this.chatModel  = config.get<string>('gemini.chatModel') ?? 'gemini-2.5-flash';
    // Opt-C: resumir es trivial → modelo liviano. La respuesta general (que ve
    // el cliente) se queda en el modelo principal por calidad.
    this.lightModel = config.get<string>('gemini.lightModel') ?? 'gemini-2.5-flash-lite';
    this.http       = axios.create({ timeout: 30000 });
  }

  async summarize(messages: GeminiContent[]): Promise<string> {
    if (!this.apiKey && !this.geminiClient.isUsingOAuth()) {
      this.logger.warn(JSON.stringify({
        event: 'summarize_skipped', reason: 'sin credenciales de Gemini',
      }));
      return '';
    }
    // FASE B1: antes esto era parte del mismo `return ''` que el catch, así que
    // "no había suficiente conversación" y "la llamada explotó" eran
    // indistinguibles para el llamador. Se separan.
    if (messages.length < 4) {
      this.logger.debug(`summarize: solo ${messages.length} mensajes (mínimo 4) — omitido`);
      return '';
    }
    try {
      const transcript = messages
        .map(m => `${m.role === 'user' ? 'Cliente' : 'Bot'}: ${m.parts[0]?.text ?? ''}`)
        .join('\n');

      const url     = this.geminiClient.buildUrl(GEMINI_BASE, this.lightModel, 'generateContent', this.apiKey);
      const headers = await this.geminiClient.getAuthHeaders();
      geminiTelemetry.record();
      const res     = await this.retry.execute(() => this.http.post(url, {
        contents: [{
          role: 'user',
          parts: [{ text: `Resume esta conversación de soporte en máximo 2 oraciones. Incluye qué necesitaba el cliente y si se resolvió.\n\n${transcript}` }],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 120, thinkingConfig: { thinkingBudget: 0 } },
      }, { headers }), { label: 'gemini-summarize', maxAttempts: 2 });

      const texto = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
      if (!texto) {
        // Respuesta 200 pero sin contenido: filtro de seguridad, corte por
        // maxOutputTokens, o forma inesperada. Sin este log era invisible.
        this.logger.warn(JSON.stringify({
          event: 'summarize_empty', model: this.lightModel,
          finishReason: res.data?.candidates?.[0]?.finishReason ?? null,
        }));
      }
      return texto;
    } catch (err) {
      // FASE B1 (2026-08-07): acá había un `catch { return ''; }` mudo. El
      // llamador leía el '' como "no había nada que resumir" y seguía, así que
      // el resumidor podía estar caído durante SEMANAS sin que nada lo dijera:
      // se midió 1 resumen exitoso de 58 intentos en producción, y cada
      // escalación llegaba al agente humano sin contexto (hasSummary:false)
      // sin ninguna excepción asociada en los logs.
      this.logger.warn(JSON.stringify({
        event:   'summarize_failed',
        model:   this.lightModel,
        status:  (err as any)?.response?.status ?? null,
        apiCode: (err as any)?.response?.data?.error?.status ?? null,
        message: (err as Error).message,
        detail:  JSON.stringify((err as any)?.response?.data ?? {}).slice(0, 300),
      }));
      return '';
    }
  }

  async generateGeneralAnswer(question: string, conversationContext: string): Promise<string> {
    if (!this.apiKey && !this.geminiClient.isUsingOAuth()) return '';
    try {
      const url     = this.geminiClient.buildUrl(GEMINI_BASE, this.chatModel, 'generateContent', this.apiKey);
      const headers = await this.geminiClient.getAuthHeaders();
      geminiTelemetry.record();
      const res     = await this.retry.execute(() => this.http.post(url, {
        system_instruction: {
          parts: [{ text: `Eres el asistente de Telecom Bolivianet. Responde con sentido común y en español boliviano. NO inventes precios ni datos técnicos específicos. Si no puedes responder con certeza, ofrece conectar con un agente.` }],
        },
        contents: [{
          role: 'user',
          parts: [{ text: conversationContext ? `${conversationContext}\nCliente: ${question}` : question }],
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
      }, { headers }), { label: 'gemini-general', maxAttempts: 2 });
      return res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    } catch {
      return '';
    }
  }
}
