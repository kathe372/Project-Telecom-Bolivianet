import { ChunkVectorRepository } from './chunk-vector.repository';

describe('ChunkVectorRepository (encapsula SQL pgvector — BUG-R5)', () => {
  const ds = { query: jest.fn() };
  let repo: ChunkVectorRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new ChunkVectorRepository(ds as any);
  });

  it('search: pasa el vector formateado, el umbral y el límite', async () => {
    ds.query.mockResolvedValue([{ id: 'c1', content: 'x', similarity: 0.9, documentTitle: 'FAQ' }]);
    const rows = await repo.search([0.1, 0.2], 0.65, 3);

    expect(ds.query).toHaveBeenCalledWith(expect.stringContaining('<=> $1::vector'),
      ['[0.1,0.2]', 0.65, 3]);
    expect(rows[0].id).toBe('c1');
  });

  it('search: solo documentos activos y con embedding no nulo', async () => {
    ds.query.mockResolvedValue([]);
    await repo.search([0.1], 0.5, 5);
    const sql = ds.query.mock.calls[0][0];
    expect(sql).toContain('kd.is_active = true');
    expect(sql).toContain('kc.embedding IS NOT NULL');
  });

  it('upsert: usa ON CONFLICT (document_id, chunk_index)', async () => {
    ds.query.mockResolvedValue(undefined);
    await repo.upsert('doc-1', 'contenido', 2, [0.3, 0.4]);

    const [sql, params] = ds.query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (document_id, chunk_index)');
    // 2026-08-07: se agregó `question` — null en los chunks normales, con valor
    // sólo en los bloques de procedimiento, que se piden por nombre y no por
    // similitud.
    // `question` y `is_entry`: sólo los bloques de procedimiento los usan.
    expect(params).toEqual(['doc-1', 'contenido', 2, '[0.3,0.4]', null, false]);
  });

  it('deleteByDocument: borra por document_id parametrizado', async () => {
    ds.query.mockResolvedValue(undefined);
    await repo.deleteByDocument('doc-9');
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM knowledge_chunks WHERE document_id = $1'),
      ['doc-9'],
    );
  });
});
