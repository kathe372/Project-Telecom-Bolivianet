import { RagService } from './rag.service';

describe('RagService (orquestador)', () => {
  const embedder  = { embed: jest.fn() };
  const chunks    = { search: jest.fn() };
  const generator = { generate: jest.fn() };
  const cache     = { get: jest.fn(), set: jest.fn() };
  const config    = { get: jest.fn((k: string) => ({ 'rag.similarityThreshold': 0.65, 'rag.maxChunks': 3 }[k])) };
  let service: RagService;

  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockResolvedValue(null);
    cache.set.mockResolvedValue(undefined);
    embedder.embed.mockResolvedValue([0.1, 0.2]);
    service = new RagService(config as any, embedder as any, chunks as any, generator as any, cache as any);
  });

  it('cache HIT: devuelve la respuesta y NO busca chunks ni genera', async () => {
    cache.get.mockResolvedValue('Respuesta cacheada.');
    const r = await service.query('¿costo?', '');
    expect(r).toEqual({ found: true, answer: 'Respuesta cacheada.', fromCache: true });
    expect(chunks.search).not.toHaveBeenCalled();
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('BUG-R4: SIN contexto → embed se llama UNA sola vez', async () => {
    chunks.search.mockResolvedValue([{ id: 'c1', similarity: 0.9 }]);
    generator.generate.mockResolvedValue('respuesta');
    await service.query('¿costo de instalación?', '');
    expect(embedder.embed).toHaveBeenCalledTimes(1);
  });

  it('CON contexto → embed se llama dos veces (pregunta + búsqueda contextual)', async () => {
    chunks.search.mockResolvedValue([{ id: 'c1', similarity: 0.9 }]);
    generator.generate.mockResolvedValue('respuesta');
    await service.query('¿y eso?', 'Cliente: me interesa el Plan Oro');
    expect(embedder.embed).toHaveBeenCalledTimes(2);
  });

  // BUG-R2 + FASE 2.4: aunque llegue contexto conversacional, JAMÁS se le pasa
  // al generador — la respuesta va a una caché compartida entre clientes.
  it('BUG-R2: el contexto del cliente nunca llega al generador', async () => {
    chunks.search.mockResolvedValue([{ id: 'c1', similarity: 0.9 }]);
    generator.generate.mockResolvedValue('respuesta');
    await service.query('q', 'contexto de A');
    expect(generator.generate).toHaveBeenCalledWith('q', expect.any(Array));
    expect(generator.generate.mock.calls[0]).toHaveLength(2);
  });

  it('sin chunks relevantes → found:false (no alucina)', async () => {
    chunks.search.mockResolvedValue([]);
    const r = await service.query('¿quién ganó el mundial?', '');
    expect(r.found).toBe(false);
    expect(generator.generate).not.toHaveBeenCalled();
  });

  // ── FASE 2.3: telemetría de misses (para poder calibrar el umbral) ────────
  describe('rag_miss', () => {
    const capturarLog = () =>
      jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

    it('un miss registra la similitud del mejor candidato descartado y el gap', async () => {
      // 1ª búsqueda (con umbral) vacía; 2ª (sonda, umbral 0) trae el mejor.
      chunks.search
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'c9', similarity: 0.7212, content: 'x', documentTitle: 'FAQ' }]);
      const log = capturarLog();

      await service.query('¿qué hago si se me va el internet?', '');

      const evento = JSON.parse(log.mock.calls.at(-1)![0] as string);
      expect(evento.event).toBe('rag_miss');
      expect(evento.threshold).toBe(0.65);
      expect(evento.bestSimilarity).toBe(0.7212);
      expect(evento.gap).toBeCloseTo(0.65 - 0.7212, 4);
      expect(evento.question).toContain('se me va el internet');
    });

    it('la sonda usa umbral 0 y limit 1 (solo mide, no cambia la respuesta)', async () => {
      chunks.search.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      capturarLog();

      const r = await service.query('¿tienen fibra en Marte?', '');

      expect(chunks.search).toHaveBeenNthCalledWith(2, [0.1, 0.2], 0, 1);
      expect(r).toEqual({ found: false, answer: '' }); // la respuesta no cambia
    });

    it('si la sonda falla, igual registra el miss con bestSimilarity null', async () => {
      chunks.search
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('pgvector caído'));
      const log = capturarLog();

      const r = await service.query('¿horario de atención?', '');

      const evento = JSON.parse(log.mock.calls.at(-1)![0] as string);
      expect(evento.event).toBe('rag_miss');
      expect(evento.bestSimilarity).toBeNull();
      expect(evento.gap).toBeNull();
      expect(r.found).toBe(false); // nunca propaga el fallo de telemetría
    });

    it('un HIT no registra rag_miss', async () => {
      chunks.search.mockResolvedValue([{ id: 'c1', similarity: 0.9 }]);
      generator.generate.mockResolvedValue('respuesta');
      const log = capturarLog();

      await service.query('¿costo?', '');

      const eventos = log.mock.calls.map(c => String(c[0]));
      expect(eventos.some(e => e.includes('rag_miss'))).toBe(false);
    });
  });

  it('éxito → cachea la respuesta con el embedding de la pregunta', async () => {
    chunks.search.mockResolvedValue([{ id: 'c1', similarity: 0.88 }]);
    generator.generate.mockResolvedValue('La instalación es gratuita.');
    const r = await service.query('¿costo?', '');
    expect(cache.set).toHaveBeenCalledWith('¿costo?', [0.1, 0.2], 'La instalación es gratuita.');
    expect(r.found).toBe(true);
    expect(r.chunkId).toBe('c1');
  });

  it('respuesta vacía de la generación → found:false', async () => {
    chunks.search.mockResolvedValue([{ id: 'c1', similarity: 0.9 }]);
    generator.generate.mockResolvedValue('   ');
    expect((await service.query('q', '')).found).toBe(false);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('error en el pipeline → found:false (degrada, no rompe)', async () => {
    embedder.embed.mockRejectedValue(new Error('quota'));
    expect((await service.query('q', '')).found).toBe(false);
  });

  // FASE D3 (2026-08-07): antes, cuando los chunks superaban el umbral pero no
  // respondian la pregunta, el generador redactaba un cortes "no tengo
  // informacion sobre eso" — texto no vacio como cualquier otro. RagService lo
  // cacheaba y lo marcaba found:true, asi que una recuperacion fallida quedaba
  // congelada hasta 7 dias y se servia a TODOS los clientes. Un fallo
  // transitorio se volvia permanente, y por dentro figuraba como acierto.
  describe('D3 — una recuperacion sin respuesta util no se cachea', () => {
    const prepararBusquedaConResultados = () => {
      embedder.embed.mockResolvedValue([0.1, 0.2]);
      cache.get.mockResolvedValue(null);
      chunks.search.mockResolvedValue([{ id: 'c1', content: 'algo', similarity: 0.8 }]);
    };

    it('el centinela se traduce a found:false y NO se cachea', async () => {
      prepararBusquedaConResultados();
      generator.generate.mockResolvedValue('NO_ENCONTRADO');

      const r = await service.query('¿venden celulares?', '');

      expect(r.found).toBe(false);
      expect(r.answer).toBe('');
      expect(cache.set).not.toHaveBeenCalled();
    });

    it.each(['NO_ENCONTRADO', '  NO_ENCONTRADO  ', '"NO_ENCONTRADO"', '**NO_ENCONTRADO**', 'no_encontrado'])(
      'lo reconoce aunque venga adornado: %s',
      async (salida) => {
        prepararBusquedaConResultados();
        generator.generate.mockResolvedValue(salida);

        const r = await service.query('¿venden celulares?', '');

        expect(r.found).toBe(false);
        expect(cache.set).not.toHaveBeenCalled();
      },
    );

    it('una respuesta util que MENCIONA el centinela igual se cachea', async () => {
      prepararBusquedaConResultados();
      // El centinela solo cuenta si es lo unico que devolvio.
      generator.generate.mockResolvedValue('El router es en comodato. NO_ENCONTRADO no aplica aca.');

      const r = await service.query('¿el router es mio?', '');

      expect(r.found).toBe(true);
      expect(cache.set).toHaveBeenCalled();
    });

    it('una respuesta normal sigue cacheandose', async () => {
      prepararBusquedaConResultados();
      generator.generate.mockResolvedValue('El router es en comodato mientras tengas el servicio.');

      const r = await service.query('¿el router es mio?', '');

      expect(r.found).toBe(true);
      expect(cache.set).toHaveBeenCalled();
    });
  });

});
