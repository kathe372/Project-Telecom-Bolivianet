import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiClientService } from '../ai/gemini-client.service';
import { RETRY_POLICY, IRetryPolicy } from '../../common/resilience/retry-policy.interface';

export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/**
 * Genera embeddings vía Gemini con reintentos ante 429. Responsabilidad única
 * (SRP): antes vivía dentro del god-class RagService.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly embedModel: string;

  constructor(
    config: ConfigService,
    private readonly geminiClient: GeminiClientService,
    @Inject(RETRY_POLICY) private readonly retry: IRetryPolicy,
  ) {
    this.embedModel = config.get<string>('gemini.embedModel');
  }

  async embed(text: string, taskType: EmbedTaskType = 'RETRIEVAL_DOCUMENT'): Promise<number[]> {
    try {
      return await this.retry.execute(
        () => this.geminiClient.embedText(text, this.embedModel, taskType),
        { label: 'gemini-embed' },
      );
    } catch (err) {
      this.logger.error(`Error generando embedding: ${String(err)}`);
      throw err;
    }
  }

  /**
   * Embedding para INDEXACIÓN por lotes: no hay usuario esperando, así que usa
   * un backoff largo para sobrevivir a rate-limits sostenidos de la API.
   */
  async embedForIndexing(text: string): Promise<number[]> {
    return this.retry.execute(
      () => this.geminiClient.embedText(text, this.embedModel, 'RETRIEVAL_DOCUMENT'),
      { label: 'gemini-embed-index', maxAttempts: 3, baseMs: 35_000, capMs: 70_000 },
    );
  }
}
