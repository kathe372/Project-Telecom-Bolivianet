import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { GeminiClientService } from '../ai/gemini-client.service';
import { RETRY_POLICY, IRetryPolicy } from '../../common/resilience/retry-policy.interface';
import { GEMINI_BASE_URL as GEMINI_BASE } from '../../common/constants/app.constants';
import { geminiTelemetry } from '../ai/gemini-telemetry';
import { ChunkMatch } from './chunk-vector.repository';

/**
 * FASE D3 (2026-08-07): el centinela.
 *
 * Antes, cuando los chunks no respondían, el generador redactaba un cortés "no
 * tengo información sobre eso" — un texto no vacío como cualquier otro. Y
 * `RagService.query` cachea toda respuesta no vacía y la marca `found: true`.
 * Resultado: una recuperación fallida quedaba congelada hasta 7 días y se
 * servía a TODOS los clientes sin volver a intentarlo. Un fallo transitorio se
 * volvía permanente, y encima invisible: por dentro figuraba como acierto.
 *
 * Un centinela literal es distinguible por código; una disculpa en prosa, no.
 */
export const RAG_SIN_RESPUESTA = 'NO_ENCONTRADO';

const SYSTEM_INSTRUCTION =
  'Eres el asistente virtual de Telecom Bolivianet, una empresa de internet en Bolivia. ' +
  'Responde de forma amable, concisa y en español usando SOLO la información provista. ' +
  `Si la información provista NO contiene la respuesta, responde EXACTAMENTE con ${RAG_SIN_RESPUESTA} ` +
  'y nada más: ni disculpas, ni explicaciones, ni ofrecimientos. ' +
  'Usa emojis con moderación. No inventes precios, fechas ni datos que no estén en el contexto.';

/**
 * Genera la respuesta RAG a partir de los chunks. SRP.
 *
 * BUG-R2: la respuesta NUNCA incluye el contexto conversacional del cliente,
 * porque toda respuesta generada acá termina en la caché semántica, que se
 * comparte entre clientes: arrastrar la conversación de uno filtraría sus
 * datos al siguiente que hiciera una pregunta parecida.
 *
 * FASE 2.4 (2026-08-06): antes esto dependía de un parámetro `cacheable` que
 * RagService siempre pasaba en `true`, con `context` como cuarto argumento. La
 * rama `cacheable=false` era código muerto Y una trampa: `RagService.query`
 * llama a `cache.set(...)` de forma incondicional, así que si alguien alguna
 * vez la hubiera usado, la respuesta con datos del cliente se habría cacheado
 * igual. Se eliminaron ambos parámetros — el comportamiento seguro es el único
 * posible, no una opción que haya que acordarse de elegir.
 */
@Injectable()
export class RagAnswerGenerator {
  private readonly logger = new Logger(RagAnswerGenerator.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private readonly chatModel: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(
    config: ConfigService,
    private readonly geminiClient: GeminiClientService,
    @Inject(RETRY_POLICY) private readonly retry: IRetryPolicy,
  ) {
    this.apiKey      = config.get<string>('gemini.apiKey');
    this.chatModel   = config.get<string>('gemini.chatModel');
    this.maxTokens   = config.get<number>('gemini.maxTokens');
    this.temperature = config.get<number>('gemini.temperature');
    this.http        = axios.create({ timeout: 60_000 });
  }

  async generate(question: string, chunks: ChunkMatch[]): Promise<string> {
    const kb = chunks.map((c) => c.content).join('\n\n---\n\n');
    const userPrompt =
      `Información de la base de conocimiento:\n${kb}\n\nPregunta del cliente: ${question}`;

    try {
      const url     = this.geminiClient.buildUrl(GEMINI_BASE, this.chatModel, 'generateContent', this.apiKey);
      const headers = await this.geminiClient.getAuthHeaders();
      geminiTelemetry.record();
      const res = await this.retry.execute(() => this.http.post(url, {
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: this.temperature, maxOutputTokens: this.maxTokens },
      }, { headers }), { label: 'gemini-rag' });
      return res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } catch (err) {
      this.logger.error(`Error generando respuesta Gemini: ${String(err)}`);
      throw err;
    }
  }
}
