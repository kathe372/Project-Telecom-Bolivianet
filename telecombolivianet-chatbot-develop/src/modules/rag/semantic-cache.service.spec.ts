import { SemanticCacheService } from './semantic-cache.service';


const makeConfig = (overrides: Record<string, any> = {}) => ({
  get: jest.fn((key: string) => {
    const defaults: Record<string, any> = {
      'rag.cacheEnabled':     true,
      'rag.cacheSimilarity':  0.92,
      'rag.cacheTtlDefaultH': 24,
      'rag.cacheTtlPricingH': 6,
      'rag.cacheTtlStaticH':  168,
    };
    return overrides[key] ?? defaults[key] ?? undefined;
  }),
});

const makeDataSource = () => ({
  query: jest.fn(),
});

const makeService = (config: any, dataSource: any): SemanticCacheService =>
  new (SemanticCacheService as any)(config, dataSource) as SemanticCacheService;

const EMBEDDING = Array.from({ length: 768 }, () => 0.1);

describe('SemanticCacheService', () => {
  let dataSource: ReturnType<typeof makeDataSource>;
  let service: SemanticCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    dataSource = makeDataSource();
    service    = makeService(makeConfig(), dataSource);
  });


  it('usa DataSource (PostgreSQL) para buscar cache — sin Redis', async () => {
    dataSource.query.mockResolvedValue([]);

    await service.get(EMBEDDING);

    expect(dataSource.query).toHaveBeenCalled();
    const sql: string = dataSource.query.mock.calls[0][0];
    expect(sql).toContain('semantic_cache');
    expect(sql).toContain('vector');
  });

  it('usa DataSource (PostgreSQL) para guardar en cache — sin Redis', async () => {
    dataSource.query.mockResolvedValue([]);

    await service.set('¿cuánto cuesta el plan?', EMBEDDING, 'El plan cuesta Bs. 199/mes');

    expect(dataSource.query).toHaveBeenCalled();
    const sql: string = dataSource.query.mock.calls[0][0];
    expect(sql).toContain('INSERT INTO semantic_cache');
  });


  it('get() retorna la respuesta cuando hay un hit semántico', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 'uuid-001', answer: 'Respuesta cacheada', similarity: 0.95 }])
      .mockResolvedValue([]);

    const result = await service.get(EMBEDDING);

    expect(result).toBe('Respuesta cacheada');
  });

  it('get() retorna null cuando no hay hit (lista vacía)', async () => {
    dataSource.query.mockResolvedValue([]);

    const result = await service.get(EMBEDDING);

    expect(result).toBeNull();
  });

  it('get() retorna null y no propaga error si dataSource.query lanza', async () => {
    dataSource.query.mockRejectedValue(new Error('connection refused'));

    const result = await service.get(EMBEDDING);

    expect(result).toBeNull();
  });


  it('set() usa TTL de 6h para preguntas de precio/plan', async () => {
    dataSource.query.mockResolvedValue([]);
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T12:00:00Z'));

    await service.set('¿cuánto cuesta el plan 100mb?', EMBEDDING, 'Cuesta Bs. 199');

    const [, params] = dataSource.query.mock.calls[0];
    const expiresAt = new Date(params[3]);
    const diffH = (expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(diffH).toBeCloseTo(6, 0);

    jest.useRealTimers();
  });

  it('set() usa TTL de 168h para preguntas técnicas/estáticas', async () => {
    dataSource.query.mockResolvedValue([]);
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T12:00:00Z'));

    await service.set('¿cómo reiniciar el router?', EMBEDDING, 'Pasos para reiniciar...');

    const [, params] = dataSource.query.mock.calls[0];
    const expiresAt = new Date(params[3]);
    const diffH = (expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(diffH).toBeCloseTo(168, 0);

    jest.useRealTimers();
  });

  it('set() usa TTL de 24h para preguntas genéricas', async () => {
    dataSource.query.mockResolvedValue([]);
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T12:00:00Z'));

    await service.set('¿en qué horario atienden?', EMBEDDING, 'Atendemos de lunes a viernes de 8 a 18hs');

    const [, params] = dataSource.query.mock.calls[0];
    const expiresAt = new Date(params[3]);
    const diffH = (expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(diffH).toBeCloseTo(24, 0);

    jest.useRealTimers();
  });


  it('set() no inserta cuando la respuesta está vacía', async () => {
    await service.set('¿qué es TBN?', EMBEDDING, '   ');

    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('set() no propaga error si dataSource.query lanza', async () => {
    dataSource.query.mockRejectedValue(new Error('DB timeout'));

    await expect(
      service.set('¿qué es TBN?', EMBEDDING, 'TBN es el código de cliente'),
    ).resolves.toBeUndefined();
  });


  it('get() retorna null inmediatamente cuando cache está deshabilitado', async () => {
    const disabledSvc = makeService(makeConfig({ 'rag.cacheEnabled': false }), dataSource);

    const result = await disabledSvc.get(EMBEDDING);

    expect(result).toBeNull();
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('set() no inserta cuando cache está deshabilitado', async () => {
    const disabledSvc = makeService(makeConfig({ 'rag.cacheEnabled': false }), dataSource);

    await disabledSvc.set('¿precio?', EMBEDDING, 'Bs. 199');

    expect(dataSource.query).not.toHaveBeenCalled();
  });


  it('clearAll() ejecuta DELETE en semantic_cache', async () => {
    dataSource.query.mockResolvedValue([{ id: 'uuid-001' }, { id: 'uuid-002' }]);

    await service.clearAll();

    const sql: string = dataSource.query.mock.calls[0][0];
    expect(sql).toContain('DELETE FROM semantic_cache');
  });

  it('clearAll() no propaga error si dataSource.query lanza', async () => {
    dataSource.query.mockRejectedValue(new Error('conexión perdida'));

    await expect(service.clearAll()).resolves.toBeUndefined();
  });
});
