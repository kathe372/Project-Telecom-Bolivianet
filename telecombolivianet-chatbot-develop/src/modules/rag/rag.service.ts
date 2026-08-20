import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';
import { ChunkVectorRepository } from './chunk-vector.repository';
import { RagAnswerGenerator, RAG_SIN_RESPUESTA } from './rag-answer.generator';
import { SemanticCacheService } from './semantic-cache.service';

export interface RagResult {
  found: boolean;
  answer: string;
  chunkId?: string;
  similarity?: number;
  fromCache?: boolean;
}

/**
 * Orquestador RAG (SRP): embedding → caché → búsqueda vectorial → generación.
 * La indexación vive en DocumentIndexer; el SQL en ChunkVectorRepository; los
 * embeddings en EmbeddingService; la generación en RagAnswerGenerator.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly threshold: number;
  private readonly maxChunks: number;

  constructor(
    config: ConfigService,
    private readonly embedder: EmbeddingService,
    private readonly chunks: ChunkVectorRepository,
    private readonly generator: RagAnswerGenerator,
    private readonly cache: SemanticCacheService,
  ) {
    this.threshold = config.get<number>('rag.similarityThreshold');
    this.maxChunks = config.get<number>('rag.maxChunks');
  }

  async query(question: string, conversationContext: string): Promise<RagResult> {
    try {
      const questionEmbedding = await this.embedder.embed(question, 'RETRIEVAL_QUERY');

      const cached = await this.cache.get(questionEmbedding);
      if (cached !== null) {
        this.logger.debug(`RAG: cache hit para "${question.substring(0, 60)}"`);
        return { found: true, answer: cached, fromCache: true };
      }

      // BUG-R4: sin contexto, el vector de búsqueda es idéntico al de la pregunta
      // — no re-embeder (ahorra una llamada a la API en la mayoría de consultas).
      const searchEmbedding = conversationContext
        ? await this.embedder.embed(`${conversationContext}\nCliente: ${question}`, 'RETRIEVAL_QUERY')
        : questionEmbedding;

      const matches = await this.chunks.search(searchEmbedding, this.threshold, this.maxChunks);
      if (matches.length === 0) {
        await this.logMiss(question, searchEmbedding);
        return { found: false, answer: '' };
      }

      // La respuesta se genera SOLO con los chunks, nunca con el contexto del
      // cliente: se cachea y la caché se comparte entre clientes (BUG-R2).
      // FASE 2.4: ya no es una opción que haya que pasar — el generador no
      // acepta contexto conversacional, punto.
      const answer = await this.generator.generate(question, matches);
      if (!answer.trim()) {
        this.logger.warn('RAG: Gemini devolvió respuesta vacía — tratando como no encontrado');
        return { found: false, answer: '' };
      }

      // FASE D3: los chunks superaron el umbral pero no responden la pregunta.
      // Esto NO se cachea: si se congelara, un fallo de recuperación puntual
      // quedaría servido a todos los clientes durante días. Se registra como
      // miss para que aparezca en la telemetría del umbral.
      if (this.esSinRespuesta(answer)) {
        this.logger.log(JSON.stringify({
          event: 'rag_sin_respuesta_util',
          question: question.substring(0, 80),
          chunks: matches.length,
          mejorSimilitud: matches[0]?.similarity,
        }));
        await this.logMiss(question, searchEmbedding);
        return { found: false, answer: '' };
      }

      await this.cache.set(question, questionEmbedding, answer);
      return { found: true, answer, chunkId: matches[0].id, similarity: matches[0].similarity };
    } catch (err) {
      this.logger.error(`RAG pipeline error: ${String(err)}`);
      return { found: false, answer: '' };
    }
  }

  /** El modelo puede envolver el centinela en comillas o puntuación; se compara
   *  sobre el texto desnudo, pero solo si es LO ÚNICO que devolvió — una
   *  respuesta útil que lo mencione de pasada no debe descartarse. */
  private esSinRespuesta(answer: string): boolean {
    const desnudo = answer.trim().replace(/^[\s"'`*.]+|[\s"'`*.]+$/g, '').toUpperCase();
    return desnudo === RAG_SIN_RESPUESTA;
  }

  /**
   * FASE 2.3 (2026-08-06): registra cada consulta que NO devolvió chunks,
   * junto con la similitud del mejor candidato descartado.
   *
   * Sin esto, el umbral (0.75) es un número elegido a ojo y no hay forma de
   * saber si está descartando respuestas buenas: una paráfrasis natural del
   * cliente ("¿qué hago si se me va el internet?") frente al chunk redactado
   * de otra forma ("¿Qué hacer ante una interrupción del servicio?") puede
   * quedar en 0.72 y devolver nada, indistinguible de "no está en la base".
   *
   * Cómo leerlo: si `bestSimilarity` de los misses se concentra JUSTO por
   * debajo del umbral, hay que bajarlo. Si está muy por debajo (< 0.5), el
   * contenido realmente no existe y lo que falta es cargar documentos.
   *
   * Nunca lanza: es telemetría, no puede romper una consulta del cliente.
   */
  private async logMiss(question: string, embedding: number[]): Promise<void> {
    let bestSimilarity: number | null = null;
    try {
      // Umbral 0 = trae el vecino más cercano exista o no, solo para medir.
      const [mejor] = await this.chunks.search(embedding, 0, 1);
      bestSimilarity = mejor ? Number(mejor.similarity.toFixed(4)) : null;
    } catch {
      // Si la sonda falla, se registra igual el miss sin el dato de similitud.
    }

    this.logger.log(JSON.stringify({
      event:          'rag_miss',
      question:       question.slice(0, 120),
      threshold:      this.threshold,
      bestSimilarity,
      // Distancia al umbral: lo que hay que bajar para que este miss fuera hit.
      gap: bestSimilarity !== null
        ? Number((this.threshold - bestSimilarity).toFixed(4))
        : null,
    }));
  }
}
