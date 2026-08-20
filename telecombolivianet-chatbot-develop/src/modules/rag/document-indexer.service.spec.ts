import { DocumentIndexer } from './document-indexer.service';

describe('DocumentIndexer', () => {
  const chunker  = { split: jest.fn() };
  const embedder = { embedForIndexing: jest.fn() };
  const chunks   = { upsert: jest.fn(), deleteByDocument: jest.fn() };
  const cache    = { clearAll: jest.fn() };
  let indexer: DocumentIndexer;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    embedder.embedForIndexing.mockResolvedValue([0.1]);
    chunks.upsert.mockResolvedValue(undefined);
    cache.clearAll.mockResolvedValue(undefined);
    indexer = new DocumentIndexer(chunker as any, embedder as any, chunks as any, cache as any);
  });

  afterEach(() => jest.useRealTimers());

  it('indexa cada chunk y limpia la caché al terminar', async () => {
    chunker.split.mockReturnValue(['chunk A', 'chunk B']);
    const p = indexer.index('doc-1', 'texto largo');
    await jest.runAllTimersAsync();
    const count = await p;

    expect(count).toBe(2);
    expect(chunks.upsert).toHaveBeenCalledTimes(2);
    expect(chunks.upsert).toHaveBeenCalledWith('doc-1', 'chunk A', 0, [0.1]);
    expect(cache.clearAll).toHaveBeenCalled();
  });

  it('un chunk que falla no detiene el resto (cuenta parcial)', async () => {
    chunker.split.mockReturnValue(['A', 'B']);
    embedder.embedForIndexing.mockRejectedValueOnce(new Error('429')).mockResolvedValue([0.2]);
    const p = indexer.index('doc-1', 'x');
    await jest.runAllTimersAsync();
    expect(await p).toBe(1);
  });

  it('si TODOS los chunks fallan, no limpia la caché (0 indexados)', async () => {
    chunker.split.mockReturnValue(['A']);
    embedder.embedForIndexing.mockRejectedValue(new Error('quota'));
    const p = indexer.index('doc-1', 'x');
    await jest.runAllTimersAsync();
    expect(await p).toBe(0);
    expect(cache.clearAll).not.toHaveBeenCalled();
  });

  it('removeDocument: borra chunks y limpia la caché', async () => {
    chunks.deleteByDocument.mockResolvedValue(undefined);
    await indexer.removeDocument('doc-9');
    expect(chunks.deleteByDocument).toHaveBeenCalledWith('doc-9');
    expect(cache.clearAll).toHaveBeenCalled();
  });


  // 2026-08-07: los documentos de procedimiento no se trocean por ventana de
  // palabras — cada bloque es una unidad con su pregunta, sus ramas y sus
  // acciones. Y se rechazan ENTEROS si tienen errores: aceptar una rama rota
  // significaria descubrirla cuando un cliente cae ahi.
  describe('documentos de procedimiento', () => {
    const unir = (...lineas: string[]) => lineas.join('\n');

    const DOC_OK = unir(
      '¿No tengo internet?',
      'Mirá la luz del módem.',
      '>> BOTON: Roja -> ¿La luz está roja?',
      '',
      '¿La luz está roja?',
      'Necesitás un técnico.',
      '>> ACCION: crear_ticket tipo=cable_cortado',
    );

    it('guarda un chunk por bloque, con su pregunta normalizada', async () => {
      embedder.embedForIndexing.mockResolvedValue([0.1, 0.2]);

      // Hay un sleep de 1.2 s entre bloques y el suite usa timers falsos.
      const promesa = indexer.index('doc-1', DOC_OK);
      await jest.runAllTimersAsync();
      const n = await promesa;

      expect(n).toBe(2);
      // El chunker NO interviene: partir el bloque romperia el grafo.
      expect(chunker.split).not.toHaveBeenCalled();
      expect(chunks.upsert).toHaveBeenCalledWith(
        'doc-1', expect.stringContaining('¿No tengo internet?'), 0,
        expect.anything(), 'no tengo internet',
        // Bloque de ENTRADA: nadie lo apunta, así que por acá entra el cliente
        // escribiendo libre. Es el único que se busca por similitud.
        true,
      );
    });

    // Medido en produccion: con pregunta+cuerpo, "No tengo internet" daba 0.599
    // contra el bloque "¿No tengo internet?" y 0.601 contra "¿Mi internet esta
    // lento?" — el cuerpo, mas largo, ahogaba a la pregunta hasta invertir el
    // resultado. Se vectoriza SOLO la pregunta.
    it('vectoriza la pregunta sola, no el cuerpo', async () => {
      embedder.embedForIndexing.mockResolvedValue([0.1, 0.2]);

      const promesa = indexer.index('doc-4', DOC_OK);
      await jest.runAllTimersAsync();
      await promesa;

      expect(embedder.embedForIndexing).toHaveBeenCalledWith('¿No tengo internet?');
      // El contenido GUARDADO si lleva el cuerpo: es lo que se le muestra al
      // cliente. Lo que cambia es unicamente que se vectoriza.
      expect(chunks.upsert).toHaveBeenCalledWith(
        'doc-4', expect.stringContaining('Mirá la luz del módem.'),
        0, expect.anything(), 'no tengo internet', true,
      );
    });

    // Medido en produccion: se guardaba pregunta+cuerpo, y `body` NO lleva las
    // lineas ">> BOTON:". Al releer el bloque desde la base no habia botones,
    // el procedimiento se marcaba como terminado y el flujo moria en el primer
    // paso. Hay que guardar el bloque COMPLETO.
    it('guarda el bloque con sus directivas, no solo el texto visible', async () => {
      embedder.embedForIndexing.mockResolvedValue([0.1, 0.2]);

      const promesa = indexer.index('doc-5', DOC_OK);
      await jest.runAllTimersAsync();
      await promesa;

      const guardado = chunks.upsert.mock.calls[0][1];
      expect(guardado).toContain('>> BOTON: Roja -> ¿La luz está roja?');
      expect(guardado).toContain('Mirá la luz del módem.');
    });

    it('rechaza el documento entero si una rama apunta a la nada', async () => {
      const roto = unir('¿Hola?', 'Texto.', '>> BOTON: Seguir -> ¿No existe?');

      await expect(indexer.index('doc-2', roto)).rejects.toThrow(/no existe en el documento/);
      expect(chunks.upsert).not.toHaveBeenCalled();
    });

    it('un documento normal sigue troceándose como siempre', async () => {
      chunker.split.mockReturnValue(['pedazo 1', 'pedazo 2']);
      embedder.embedForIndexing.mockResolvedValue([0.1]);

      const promesa = indexer.index('doc-3', 'Texto comun sin directivas.');
      await jest.runAllTimersAsync();
      await promesa;

      expect(chunker.split).toHaveBeenCalled();
      expect(chunks.upsert).toHaveBeenCalledWith('doc-3', 'pedazo 1', 0, expect.anything());
    });
  });

});
