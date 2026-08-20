import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';


@Injectable()
export class DatabaseMigrationService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseMigrationService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Verificando schema de base de datos...');
    try {
      await this.ensureExtensions();
      await this.ensureEmbeddingColumn();
      await this.ensureChunkUniqueIndex();
      await this.ensureConversationSummaryColumn();
      await this.ensureMessagesMediaColumns();
      await this.ensureSemanticCacheTable();
      await this.ensureConversationsPhoneIndex();
      await this.ensureBotEventsTable();
      await this.ensureConversationsSummaryAtColumn();
      await this.ensureChunkQuestionColumn();
      // FASE 0.2: va al FINAL a propósito — necesita que knowledge_chunks y
      // semantic_cache ya existan con su columna vectorial.
      await this.ensureVectorIndexes();
      this.logger.log('Schema verificado ✔');
    } catch (err) {
      this.logger.error(`Error crítico en migración de schema: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * 2026-08-07: la pregunta con la que se identifica un bloque de procedimiento.
   *
   * Los bloques de un flujo guiado NO se buscan por similitud: se piden por
   * nombre. Se midió que la similitud, incluso con consultas fijas por estado,
   * acertaba 5 de 6 con márgenes de 0.012-0.02 — a esa distancia el ganador es
   * azar, y un flujo que se equivoca de paso es peor que no tenerlo.
   *
   * NULL en los chunks normales: sólo los procedimientos la usan.
   */
  private async ensureChunkQuestionColumn(): Promise<void> {
    const [row] = await this.dataSource.query<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_chunks' AND column_name = 'question'
      ) AS exists
    `);
    if (row?.exists) return;

    this.logger.warn('Columna question faltante en knowledge_chunks — aplicando migración');
    await this.dataSource.query('ALTER TABLE knowledge_chunks ADD COLUMN question text');
    await this.dataSource.query(
      'ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS is_entry boolean NOT NULL DEFAULT false',
    );
    await this.dataSource.query(
      'CREATE INDEX IF NOT EXISTS idx_chunks_question ON knowledge_chunks (question)',
    );
  }

  private async ensureExtensions(): Promise<void> {
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  }

  private async ensureEmbeddingColumn(): Promise<void> {
    const [row] = await this.dataSource.query<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_chunks'
          AND column_name = 'embedding'
      ) AS exists
    `);

    if (row.exists) return;

    this.logger.warn('Columna embedding faltante en knowledge_chunks — aplicando migración');
    await this.dataSource.query(
      'ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(768)',
    );
    // FASE 0.2: el índice vectorial ya NO se crea acá. Lo decide
    // ensureVectorIndexes() al final del arranque, en un solo lugar.
    this.logger.log('Migración: columna embedding añadida ✔');
  }

  /**
   * BUG-7: RagService.indexDocument usa ON CONFLICT (document_id, chunk_index);
   * sin este índice único TODA indexación de documentos falla con 0 chunks.
   */
  private async ensureChunkUniqueIndex(): Promise<void> {
    const [row] = await this.dataSource.query<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'knowledge_chunks'
          AND indexname = 'uq_chunks_doc_idx'
      ) AS exists
    `);

    if (row.exists) return;

    this.logger.warn('Índice único faltante en knowledge_chunks(document_id, chunk_index) — aplicando migración');
    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_chunks_doc_idx
        ON knowledge_chunks(document_id, chunk_index)
    `);
    this.logger.log('Migración: índice único uq_chunks_doc_idx creado ✔');
  }

  /**
   * FASE 0.2 (2026-08-06): migra los índices vectoriales de IVFFLAT a HNSW.
   *
   * Por qué IVFFLAT estaba mal acá, con dos problemas que se sumaban:
   *
   *  1. `ivfflat.probes` nunca se configuraba y su default en pgvector es 1.
   *     Con `lists = 100`, cada búsqueda escaneaba UNA de las 100 particiones
   *     (~1 % de los vectores). El recall era una lotería: preguntas que SÍ
   *     estaban en la base devolvían `found: false` y el bot escalaba.
   *  2. IVFFLAT entrena sus centroides en el momento de CREATE INDEX. Este
   *     método corría en cada arranque y podía crear el índice sobre una tabla
   *     VACÍA — centroides inútiles que nunca se re-entrenaban al cargar los
   *     documentos después.
   *
   * HNSW no tiene ninguno de los dos problemas: se construye de forma
   * incremental (sirve igual si la tabla está vacía al crearlo) y su parámetro
   * de búsqueda (`ef_search`, default 40) da buen recall sin tocar nada.
   *
   * Si el pgvector instalado es anterior a 0.5.0 no existe HNSW; en ese caso
   * se deja la tabla SIN índice vectorial a propósito: para el volumen de una
   * base de conocimiento (cientos o pocos miles de chunks) el escaneo exacto
   * tarda milisegundos y da 100 % de recall, que es infinitamente preferible a
   * un IVFFLAT mal entrenado que devuelve resultados incompletos en silencio.
   */
  private async ensureVectorIndexes(): Promise<void> {
    await this.migrateVectorIndex('knowledge_chunks', 'embedding', 'idx_chunks_embedding_hnsw');
    await this.migrateVectorIndex('semantic_cache', 'query_embedding', 'idx_semantic_cache_embedding_hnsw');
  }

  private async migrateVectorIndex(
    tabla: string, columna: string, nombreHnsw: string,
  ): Promise<void> {
    if (!(await this.tableExists(tabla))) {
      this.logger.debug(`Índice vectorial: tabla ${tabla} inexistente — omitido`);
      return;
    }

    const indices = await this.dataSource.query<{ relname: string; amname: string }[]>(`
      SELECT c.relname, am.amname
      FROM pg_class c
      JOIN pg_index i  ON i.indexrelid = c.oid
      JOIN pg_class t  ON t.oid        = i.indrelid
      JOIN pg_am    am ON am.oid       = c.relam
      WHERE t.relname = $1 AND am.amname IN ('ivfflat', 'hnsw')
    `, [tabla]);

    if (indices.some(ix => ix.amname === 'hnsw')) return; // ya migrado

    const obsoletos = indices.filter(ix => ix.amname === 'ivfflat');

    try {
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS ${nombreHnsw} ` +
        `ON ${tabla} USING hnsw (${columna} vector_cosine_ops)`,
      );
      await this.dropIndexes(obsoletos);
      this.logger.log(`Migración: ${tabla} usa HNSW (${nombreHnsw}) ✔`);
    } catch (err) {
      // pgvector < 0.5.0 (sin HNSW). Se quita igual el IVFFLAT: sin índice, la
      // búsqueda es exacta y completa; con IVFFLAT mal entrenado, es incompleta.
      await this.dropIndexes(obsoletos);
      this.logger.warn(
        `HNSW no disponible en ${tabla} (${(err as Error).message}). ` +
        `Se deja sin índice vectorial: búsqueda exacta, recall 100 %. ` +
        `Actualizar pgvector a >= 0.5.0 cuando el volumen lo justifique.`,
      );
    }
  }

  private async dropIndexes(indices: { relname: string }[]): Promise<void> {
    for (const ix of indices) {
      // Los nombres vienen del catálogo de PostgreSQL, pero no se interpolan
      // sin validar: un identificador solo puede ser [A-Za-z0-9_].
      if (!/^[A-Za-z0-9_]+$/.test(ix.relname)) {
        this.logger.warn(`Índice con nombre inesperado, no se elimina: ${ix.relname}`);
        continue;
      }
      await this.dataSource.query(`DROP INDEX IF EXISTS ${ix.relname}`);
      this.logger.log(`Migración: índice IVFFLAT ${ix.relname} eliminado ✔`);
    }
  }

  private async tableExists(tabla: string): Promise<boolean> {
    const [row] = await this.dataSource.query<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = $1
      ) AS exists
    `, [tabla]);
    return !!row?.exists;
  }

  private async ensureMessagesMediaColumns(): Promise<void> {
    const [row] = await this.dataSource.query<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages'
          AND column_name = 'media_url'
      ) AS exists
    `);

    if (row.exists) return;

    this.logger.warn('Columnas media_url/media_type faltantes en messages — aplicando migración');
    await this.dataSource.query(
      'ALTER TABLE messages ADD COLUMN media_url VARCHAR(500), ADD COLUMN media_type VARCHAR(20)',
    );
    this.logger.log('Migración: columnas media_url y media_type añadidas a messages ✔');
  }

  private async ensureConversationSummaryColumn(): Promise<void> {
    const [row] = await this.dataSource.query<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversations'
          AND column_name = 'summary'
      ) AS exists
    `);

    if (row.exists) return;

    this.logger.warn('Columna summary faltante en conversations — aplicando migración');
    await this.dataSource.query(
      'ALTER TABLE conversations ADD COLUMN summary TEXT',
    );
    this.logger.log('Migración: columna summary añadida a conversations ✔');
  }

  private async ensureSemanticCacheTable(): Promise<void> {
    const [row] = await this.dataSource.query<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'semantic_cache'
      ) AS exists
    `);

    if (row.exists) return;

    this.logger.log('Tabla semantic_cache no encontrada — creando...');

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS semantic_cache (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        query_text      TEXT NOT NULL,
        query_embedding vector(768),
        answer          TEXT NOT NULL,
        hit_count       INT  NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at      TIMESTAMPTZ NOT NULL
      )
    `);
    // FASE 0.2: el índice vectorial lo crea ensureVectorIndexes() (HNSW), que
    // corre al final del arranque. Acá solo el btree de expiración.
    await this.dataSource.query(`
      CREATE INDEX idx_semantic_cache_expires ON semantic_cache(expires_at)
    `);

    this.logger.log('Migración: tabla semantic_cache creada ✔');
  }

  /** MEJORA-1D: marca de tiempo del último resumen (para no re-resumir sin cambios). */
  private async ensureConversationsSummaryAtColumn(): Promise<void> {
    const [row] = await this.dataSource.query<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversations' AND column_name = 'summary_at'
      ) AS exists
    `);

    if (row.exists) return;

    this.logger.warn('Columna summary_at faltante en conversations — aplicando migración');
    await this.dataSource.query(
      'ALTER TABLE conversations ADD COLUMN summary_at TIMESTAMPTZ',
    );
    this.logger.log('Migración: columna summary_at añadida a conversations ✔');
  }

  /** MEJORA-1A: tabla de eventos del agente para métricas (intenciones, latencia). */
  private async ensureBotEventsTable(): Promise<void> {
    const [row] = await this.dataSource.query<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'bot_events'
      ) AS exists
    `);

    if (row.exists) return;

    this.logger.log('Tabla bot_events no encontrada — creando...');
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS bot_events (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        phone_number    VARCHAR(20)  NOT NULL,
        event_type      VARCHAR(30)  NOT NULL DEFAULT 'agent_run',
        tools_called    JSONB        NOT NULL DEFAULT '[]',
        duration_ms     INT          NOT NULL DEFAULT 0,
        response_length INT          NOT NULL DEFAULT 0,
        sentiment       VARCHAR(20),
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_bot_events_created_at ON bot_events(created_at)
    `);
    this.logger.log('Migración: tabla bot_events creada ✔');
  }

  private async ensureConversationsPhoneIndex(): Promise<void> {
    const [row] = await this.dataSource.query<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'conversations'
          AND indexname = 'uq_conversations_phone_number'
      ) AS exists
    `);

    if (row.exists) return;

    this.logger.warn('Índice único faltante en conversations.phone_number — aplicando migración');
    await this.dataSource.query(
      'CREATE UNIQUE INDEX uq_conversations_phone_number ON conversations(phone_number)',
    );
    this.logger.log('Migración: índice único uq_conversations_phone_number creado ✔');
  }
}
