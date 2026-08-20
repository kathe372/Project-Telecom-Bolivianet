import { DatabaseMigrationService } from './database-migration.service';


const makeDataSource = (overrides: Partial<{ query: jest.Mock }> = {}) => ({
  query: overrides.query ?? jest.fn().mockResolvedValue([{ exists: true }]),
});

const makeService = (dataSource: any): DatabaseMigrationService => {
  const svc = new (DatabaseMigrationService as any)(dataSource);
  return svc as DatabaseMigrationService;
};

/** SQL ejecutado, normalizado a una línea para poder hacer matching cómodo. */
const sqlsDe = (dataSource: { query: jest.Mock }): string[] =>
  dataSource.query.mock.calls.map((c: any[]) => String(c[0]).replace(/\s+/g, ' ').trim());

/**
 * Encola las respuestas que migrateVectorIndex consume para UNA tabla sin
 * índice previo: 1) tableExists → true  2) listado vacío  3) CREATE INDEX.
 */
const encolarTablaSinIndice = (query: jest.Mock): jest.Mock =>
  query
    .mockResolvedValueOnce([{ exists: true }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);

describe('DatabaseMigrationService.migrateVectorIndex (FASE 0.2 — IVFFLAT → HNSW)', () => {
  let dataSource: { query: jest.Mock };
  let service: DatabaseMigrationService;

  beforeEach(() => {
    dataSource = makeDataSource({ query: jest.fn() });
    service    = makeService(dataSource);
  });

  it('crea HNSW y elimina el IVFFLAT obsoleto', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ relname: 'idx_chunks_embedding', amname: 'ivfflat' }])
      .mockResolvedValue([]);

    await (service as any).migrateVectorIndex(
      'knowledge_chunks', 'embedding', 'idx_chunks_embedding_hnsw',
    );

    const sqls = sqlsDe(dataSource);
    const create = sqls.find(q => q.includes('CREATE INDEX'));
    expect(create).toMatch(/USING hnsw/);
    expect(create).toMatch(/vector_cosine_ops/);
    expect(create).not.toMatch(/ivfflat/);
    // Regresión: nunca más un índice con lists=N (el que causaba el recall pobre)
    expect(create).not.toMatch(/lists/);
    expect(sqls.some(q => q === 'DROP INDEX IF EXISTS idx_chunks_embedding')).toBe(true);
  });

  it('el DROP del IVFFLAT ocurre DESPUÉS del CREATE del HNSW (sin ventana sin índice)', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ relname: 'idx_chunks_embedding', amname: 'ivfflat' }])
      .mockResolvedValue([]);

    await (service as any).migrateVectorIndex(
      'knowledge_chunks', 'embedding', 'idx_chunks_embedding_hnsw',
    );

    const sqls      = sqlsDe(dataSource);
    const idxCreate = sqls.findIndex(q => q.includes('CREATE INDEX'));
    const idxDrop   = sqls.findIndex(q => q.includes('DROP INDEX'));
    expect(idxCreate).toBeGreaterThanOrEqual(0);
    expect(idxDrop).toBeGreaterThan(idxCreate);
  });

  it('es idempotente: si ya hay HNSW no ejecuta ningún DDL', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ relname: 'idx_chunks_embedding_hnsw', amname: 'hnsw' }]);

    await (service as any).migrateVectorIndex(
      'knowledge_chunks', 'embedding', 'idx_chunks_embedding_hnsw',
    );

    const sqls = sqlsDe(dataSource);
    expect(sqls.some(q => q.includes('CREATE INDEX'))).toBe(false);
    expect(sqls.some(q => q.includes('DROP INDEX'))).toBe(false);
    expect(dataSource.query).toHaveBeenCalledTimes(2); // tableExists + listado
  });

  it('pgvector sin HNSW: cae a búsqueda exacta y IGUAL elimina el IVFFLAT', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ relname: 'idx_chunks_embedding', amname: 'ivfflat' }])
      .mockRejectedValueOnce(new Error('access method "hnsw" does not exist'))
      .mockResolvedValue([]);

    await expect(
      (service as any).migrateVectorIndex('knowledge_chunks', 'embedding', 'idx_chunks_embedding_hnsw'),
    ).resolves.toBeUndefined(); // no propaga: no debe tumbar el arranque

    const sqls = sqlsDe(dataSource);
    expect(sqls.some(q => q === 'DROP INDEX IF EXISTS idx_chunks_embedding')).toBe(true);
  });

  it('tabla inexistente: no intenta crear nada', async () => {
    dataSource.query.mockResolvedValueOnce([{ exists: false }]);

    await (service as any).migrateVectorIndex(
      'semantic_cache', 'query_embedding', 'idx_semantic_cache_embedding_hnsw',
    );

    expect(dataSource.query).toHaveBeenCalledTimes(1);
    expect(sqlsDe(dataSource).some(q => q.includes('CREATE INDEX'))).toBe(false);
  });

  it('no elimina índices con nombres que no son identificadores válidos (anti-inyección)', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ relname: 'idx"; DROP TABLE knowledge_chunks; --', amname: 'ivfflat' }])
      .mockResolvedValue([]);

    await (service as any).migrateVectorIndex(
      'knowledge_chunks', 'embedding', 'idx_chunks_embedding_hnsw',
    );

    expect(sqlsDe(dataSource).some(q => q.includes('DROP INDEX'))).toBe(false);
  });
});

describe('DatabaseMigrationService.ensureVectorIndexes', () => {
  it('migra knowledge_chunks y semantic_cache', async () => {
    const dataSource = makeDataSource({ query: jest.fn() });
    encolarTablaSinIndice(dataSource.query); // knowledge_chunks
    encolarTablaSinIndice(dataSource.query); // semantic_cache
    const service = makeService(dataSource);

    await (service as any).ensureVectorIndexes();

    const creates = sqlsDe(dataSource).filter(q => q.includes('CREATE INDEX'));
    expect(creates.some(q => q.includes('knowledge_chunks') && q.includes('hnsw'))).toBe(true);
    expect(creates.some(q => q.includes('semantic_cache') && q.includes('hnsw'))).toBe(true);
  });
});

describe('DatabaseMigrationService.onModuleInit', () => {
  it('llama a ensureVectorIndexes al final del arranque', async () => {
    const dataSource = makeDataSource();
    const service    = makeService(dataSource);

    const spy = jest
      .spyOn(service as any, 'ensureVectorIndexes')
      .mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('ninguna migración del arranque crea ya un índice IVFFLAT', async () => {
    const dataSource = makeDataSource({
      // Todo "no existe" → se ejecutan TODAS las ramas de creación.
      query: jest.fn().mockResolvedValue([{ exists: false }]),
    });
    const service = makeService(dataSource);

    await service.onModuleInit().catch(() => undefined);

    const sqls = sqlsDe(dataSource);
    expect(sqls.some(q => q.toLowerCase().includes('ivfflat'))).toBe(false);
    expect(sqls.some(q => q.toLowerCase().includes('lists ='))).toBe(false);
  });
});
