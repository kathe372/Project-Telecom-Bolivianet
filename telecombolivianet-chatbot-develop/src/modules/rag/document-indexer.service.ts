import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { ChunkVectorRepository } from './chunk-vector.repository';
import { TextChunker } from './text-chunker';
import { SemanticCacheService } from './semantic-cache.service';
import { parseProcedure, normalizarPregunta, ProcedureBlock } from './procedure-parser';

/** Un documento es un procedimiento si declara al menos una rama o acción. */
const MARCA_PROCEDIMIENTO = /^>>\s*(BOTON|ACCION)\s*:/im;

export class DocumentoInvalidoError extends Error {
  constructor(public readonly errores: string[]) {
    super(`El documento tiene ${errores.length} error(es):\n- ${errores.join('\n- ')}`);
  }
}

const CHUNK_DELAY_MS = 1_200; // respeta rate-limits entre chunks

/**
 * Indexa documentos en la base vectorial. SRP: antes vivía dentro de RagService.
 * Colabora con TextChunker (partir), EmbeddingService (vectorizar por lotes) y
 * ChunkVectorRepository (persistir).
 */
@Injectable()
export class DocumentIndexer {
  private readonly logger = new Logger(DocumentIndexer.name);

  constructor(
    private readonly chunker: TextChunker,
    private readonly embedder: EmbeddingService,
    private readonly chunks: ChunkVectorRepository,
    private readonly cache: SemanticCacheService,
  ) {}

  async index(documentId: string, text: string): Promise<number> {
    // Un procedimiento no se trocea por ventana de palabras: cada bloque es una
    // unidad con su pregunta, sus ramas y sus acciones. Partirlo rompería el
    // grafo.
    if (MARCA_PROCEDIMIENTO.test(text ?? '')) {
      return this.indexarProcedimiento(documentId, text);
    }

    const pieces = this.chunker.split(text);
    let indexed = 0;

    for (let i = 0; i < pieces.length; i++) {
      try {
        if (i > 0) await this.sleep(CHUNK_DELAY_MS);
        const embedding = await this.embedder.embedForIndexing(pieces[i]);
        await this.chunks.upsert(documentId, pieces[i], i, embedding);
        indexed++;
      } catch (err) {
        this.logger.error(`Error indexando chunk ${i} de ${documentId}: ${String(err)}`);
      }
    }

    if (indexed === 0 && pieces.length > 0) {
      this.logger.error(
        `Documento ${documentId}: TODOS los chunks fallaron (0/${pieces.length}). ` +
        `Revisar el último error por chunk — causas típicas: constraint único faltante, ` +
        `cuota de Gemini excedida (429), API key inválida o Vertex AI deshabilitado.`,
      );
    } else {
      this.logger.log(`Documento ${documentId}: ${indexed}/${pieces.length} chunks indexados`);
      await this.cache.clearAll();
    }
    return indexed;
  }

  /**
   * Indexa un documento de procedimiento.
   *
   * Se rechaza ENTERO si tiene errores. Aceptar un procedimiento con una rama
   * rota significaría descubrirlo cuando un cliente cae ahí — el patrón que ya
   * nos costó caro varias veces: fallar en silencio y enterarse tarde.
   */
  private async indexarProcedimiento(documentId: string, text: string): Promise<number> {
    const { blocks, errors } = parseProcedure(text);
    if (errors.length > 0) {
      this.logger.warn(`Documento ${documentId} rechazado: ${errors.length} error(es)`);
      throw new DocumentoInvalidoError(errors);
    }

    const lista: ProcedureBlock[] = [...blocks.values()];
    let indexed = 0;

    for (let i = 0; i < lista.length; i++) {
      const bloque = lista[i];
      // Se guarda el bloque COMPLETO, con sus directivas: `body` no las lleva,
      // y sin ellas el ejecutor no encontraba botones al releer el bloque desde
      // la base. Medido en producción: el flujo mostraba el primer paso y moría
      // ahí, porque un bloque sin botones se marca como terminado.
      const contenido = bloque.raw ?? [bloque.question, bloque.body].join('\n');
      try {
        if (i > 0) await this.sleep(CHUNK_DELAY_MS);
        // Se vectoriza SOLO la pregunta, no el cuerpo.
        //
        // Medido en producción (2026-08-07): con pregunta+cuerpo, el mensaje
        // "No tengo internet" daba 0.599 contra el bloque cuya pregunta es
        // literalmente "¿No tengo internet?" — y 0.601 contra "¿Mi internet
        // está lento?", cuyo cuerpo tiene 326 caracteres sobre router, conexión
        // y velocidad contra 143 del correcto. El cuerpo ahogaba a la pregunta
        // hasta invertir el resultado.
        //
        // El cuerpo es lo que el cliente LEE; la pregunta es lo que el cliente
        // DICE. Para reconocer por dónde entra, sólo la pregunta importa.
        const embedding = await this.embedder.embedForIndexing(bloque.question);
        await this.chunks.upsert(
          documentId, contenido, i, embedding,
          normalizarPregunta(bloque.question), bloque.isEntry === true,
        );
        indexed++;
      } catch (err) {
        this.logger.error(`Error indexando bloque "${bloque.question}": ${String(err)}`);
      }
    }

    this.logger.log(`Procedimiento ${documentId}: ${indexed}/${lista.length} bloques indexados`);
    await this.cache.clearAll();
    return indexed;
  }

  async removeDocument(documentId: string): Promise<void> {
    await this.chunks.deleteByDocument(documentId);
    await this.cache.clearAll();
  }

  /**
   * FASE 2.2 (2026-08-06): invalida la caché semántica SIN tocar los chunks.
   *
   * Hace falta al activar o desactivar un documento. La búsqueda vectorial sí
   * respeta `is_active`, pero la caché no: una respuesta ya generada a partir
   * de un documento que se acaba de desactivar se seguía sirviendo hasta que
   * expirara su TTL — que para contenido "estático" (router, contrato,
   * política, garantía) es de 168 h. Si el documento se desactivó justamente
   * porque tenía un precio viejo o una política derogada, el bot seguía
   * repitiendo el dato equivocado durante una semana.
   */
  async invalidateCache(): Promise<void> {
    await this.cache.clearAll();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
