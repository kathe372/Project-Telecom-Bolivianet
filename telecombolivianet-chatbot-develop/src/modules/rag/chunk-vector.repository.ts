import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { toSqlVector } from './pgvector.util';

export interface ChunkMatch {
  id: string;
  content: string;
  similarity: number;
  documentTitle: string;
}

/**
 * BUG-R5: la entidad `KnowledgeChunk` no declara la columna `embedding` (pgvector
 * no es soportado nativamente por TypeORM). Antes el SQL crudo de chunks estaba
 * disperso en RagService. Aquí queda ENCAPSULADO: es el único lugar que conoce
 * pgvector y el esquema real de la tabla.
 */
@Injectable()
export class ChunkVectorRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async search(embedding: number[], threshold: number, limit: number): Promise<ChunkMatch[]> {
    return this.ds.query(
      `SELECT kc.id, kc.content, kd.title AS "documentTitle",
              1 - (kc.embedding <=> $1::vector) AS similarity
       FROM knowledge_chunks kc
       JOIN knowledge_documents kd ON kd.id = kc.document_id
       WHERE kd.is_active = true
         AND kc.embedding IS NOT NULL
         AND 1 - (kc.embedding <=> $1::vector) >= $2
       ORDER BY kc.embedding <=> $1::vector
       LIMIT $3`,
      [toSqlVector(embedding), threshold, limit],
    );
  }

  async upsert(
    documentId: string, content: string, index: number, embedding: number[],
    question: string | null = null, isEntry = false,
  ): Promise<void> {
    await this.ds.query(
      `INSERT INTO knowledge_chunks (id, document_id, content, chunk_index, embedding, question, is_entry)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4::vector, $5, $6)
       ON CONFLICT (document_id, chunk_index)
       DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding,
                     question = EXCLUDED.question, is_entry = EXCLUDED.is_entry`,
      [documentId, content, index, toSqlVector(embedding), question, isEntry],
    );
  }

  /**
   * Trae un bloque de procedimiento POR NOMBRE, no por parecido.
   *
   * Es lo que hace determinista al flujo guiado: cuando el ejecutor ya sabe a
   * qué bloque va, buscarlo por similitud sólo agrega una forma de equivocarse.
   * Medido: con consultas fijas, la similitud fallaba 1 de 6.
   */
  /** Solo los bloques de ENTRADA de procedimientos. El cliente entra escribiendo
   *  libre, así que acá sí hace falta similitud — pero acotada a los puntos de
   *  entrada, no a todo el corpus. */
  async searchProcedureEntries(embedding: number[], limit = 3): Promise<(ChunkMatch & { question: string })[]> {
    return this.ds.query(
      `SELECT kc.id, kc.content, kc.question, kd.title AS "documentTitle",
              1 - (kc.embedding <=> $1::vector) AS similarity
       FROM knowledge_chunks kc
       JOIN knowledge_documents kd ON kd.id = kc.document_id
       WHERE kd.is_active = true AND kc.is_entry = true AND kc.question IS NOT NULL
         AND kc.embedding IS NOT NULL
       ORDER BY kc.embedding <=> $1::vector
       LIMIT $2`,
      [toSqlVector(embedding), limit],
    );
  }

  /** Mejor similitud entre los chunks que NO son entradas de procedimiento.
   *  Sirve de referencia: si el RAG tiene una respuesta mejor, no hay que
   *  secuestrar la conversacion hacia un flujo. */
  async bestNonEntrySimilarity(embedding: number[]): Promise<number> {
    const filas: { similarity: number }[] = await this.ds.query(
      `SELECT 1 - (kc.embedding <=> $1::vector) AS similarity
       FROM knowledge_chunks kc JOIN knowledge_documents kd ON kd.id = kc.document_id
       WHERE kd.is_active = true AND coalesce(kc.is_entry, false) = false
         AND kc.embedding IS NOT NULL
       ORDER BY kc.embedding <=> $1::vector LIMIT 1`,
      [toSqlVector(embedding)],
    );
    return filas[0]?.similarity ?? 0;
  }

  async findByQuestion(questionKey: string): Promise<ChunkMatch | null> {
    const filas: ChunkMatch[] = await this.ds.query(
      `SELECT kc.id, kc.content, kd.title AS "documentTitle", 1 AS similarity
       FROM knowledge_chunks kc
       JOIN knowledge_documents kd ON kd.id = kc.document_id
       WHERE kd.is_active = true AND kc.question = $1
       LIMIT 1`,
      [questionKey],
    );
    return filas[0] ?? null;
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.ds.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [documentId]);
  }
}
