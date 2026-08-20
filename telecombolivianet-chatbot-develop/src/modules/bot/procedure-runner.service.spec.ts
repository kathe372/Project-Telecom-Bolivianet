import { ProcedureRunnerService, PROCEDIMIENTO_TTL_MS } from './procedure-runner.service';

/**
 * El ejecutor no conoce ni un texto del flujo: pide bloques por nombre y arma
 * los botones con lo que declara el documento. Estos tests fijan esa frontera.
 */
describe('ProcedureRunnerService', () => {
  const chunks = {
    findByQuestion: jest.fn(),
    searchProcedureEntries: jest.fn(),
    bestNonEntrySimilarity: jest.fn().mockResolvedValue(0),
  };
  const embedder = { embed: jest.fn().mockResolvedValue([0.1, 0.2]) };
  const config   = { get: jest.fn().mockReturnValue(0.62) };
  let runner: ProcedureRunnerService;

  const sesion = (extra: Record<string, unknown> = {}) =>
    ({ phoneNumber: '59171000001', clientName: 'JOSE PADILLA', ...extra }) as any;

  const bloqueLuz = [
    '¿No tengo internet?',
    'Mirá el módem y fijate de qué color está la luz.',
    '¿De qué color está?',
    '>> BOTON: 🔴 Roja -> ¿La luz está roja?',
    '>> BOTON: 🟢 Verde -> ¿La luz está verde?',
  ].join('\n');

  beforeEach(() => {
    jest.clearAllMocks();
    embedder.embed.mockResolvedValue([0.1, 0.2]);
    chunks.bestNonEntrySimilarity.mockResolvedValue(0);
    config.get.mockReturnValue(0.62);
    runner = new ProcedureRunnerService(chunks as any, embedder as any, config as any);
  });

  it('renderiza el bloque y arma los botones que declara el documento', async () => {
    chunks.findByQuestion.mockResolvedValue({ id: 'c1', content: bloqueLuz });

    const paso = await runner.ir('¿No tengo internet?', sesion())!;

    expect(chunks.findByQuestion).toHaveBeenCalledWith('no tengo internet');
    // La pregunta es el NOMBRE del bloque, no parte del mensaje al cliente.
    expect(paso!.texto).not.toContain('¿No tengo internet?');
    expect(paso!.texto).toContain('Mirá el módem');
    expect(paso!.botones).toEqual([
      { id: 'proc:la luz esta roja',  title: '🔴 Roja' },
      { id: 'proc:la luz esta verde', title: '🟢 Verde' },
    ]);
  });

  it('devuelve las acciones declaradas, sin ejecutarlas', async () => {
    chunks.findByQuestion.mockResolvedValue({
      id: 'c2',
      content: '¿La luz está roja?\nNecesitás un técnico.\n>> ACCION: crear_ticket tipo=cable_cortado',
    });

    const paso = await runner.ir('¿La luz está roja?', sesion());

    expect(paso!.acciones).toEqual([{ name: 'crear_ticket', params: { tipo: 'cable_cortado' } }]);
  });

  it('un bloque que no existe no se inventa', async () => {
    chunks.findByQuestion.mockResolvedValue(null);

    expect(await runner.ir('¿Bloque fantasma?', sesion())).toBeNull();
  });

  // ── Marcadores: el texto es del documento, el número es del cliente ────────
  describe('sustitución de marcadores', () => {
    const conMarcadores = [
      '¿Mi internet está lento?',
      'Reiniciá el router y medí tu velocidad.',
      'Tu plan es {plan} de {plan_velocidad} Mbps: menos de {plan_mitad} es un problema real.',
    ].join('\n');

    it('reemplaza con los datos reales del cliente', async () => {
      chunks.findByQuestion.mockResolvedValue({ id: 'c3', content: conMarcadores });

      const paso = await runner.ir('¿Mi internet está lento?',
        sesion({ planName: 'COBRE', planSpeedMbps: 20 }));

      expect(paso!.texto).toContain('Tu plan es COBRE de 20 Mbps: menos de 10 es un problema real.');
    });

    // Sin dato, la línea entera se cae: mejor decir menos que dejar
    // "tu plan es de {plan_velocidad} Mbps" a la vista del cliente.
    it('si falta el dato, elimina la línea en vez de mostrar el marcador', async () => {
      chunks.findByQuestion.mockResolvedValue({ id: 'c3', content: conMarcadores });

      const paso = await runner.ir('¿Mi internet está lento?', sesion());

      expect(paso!.texto).toContain('Reiniciá el router');
      expect(paso!.texto).not.toContain('{');
      expect(paso!.texto).not.toContain('Tu plan es');
    });
  });

  // ── Caducidad: todo pendiente en este sistema tiene vencimiento ────────────
  describe('vigencia del procedimiento', () => {
    it('uno recién iniciado sigue en curso', () => {
      expect(runner.enCurso(sesion({
        procedimientoActual: { clave: 'no tengo internet', at: Date.now() },
      }))).toBe('no tengo internet');
    });

    it('uno abandonado hace horas ya no cuenta', () => {
      expect(runner.enCurso(sesion({
        procedimientoActual: { clave: 'x', at: Date.now() - (PROCEDIMIENTO_TTL_MS + 60_000) },
      }))).toBeNull();
    });

    it('sin procedimiento devuelve null', () => {
      expect(runner.enCurso(sesion())).toBeNull();
    });
  });

  // La ENTRADA es el unico punto donde se usa similitud: el cliente escribe
  // libre y no hay alternativa. Pero acotada a los bloques de entrada y con
  // umbral propio, mas alto que el del RAG: arrancar un procedimiento secuestra
  // la conversacion, asi que ante la duda conviene no hacerlo.
  describe('detección de entrada', () => {
    it('arranca el procedimiento si supera el umbral', async () => {
      chunks.searchProcedureEntries.mockResolvedValue([
        { question: 'no tengo internet', similarity: 0.71, content: '', id: 'c1' },
      ]);

      expect(await runner.detectarEntrada('no me anda el internet', sesion()))
        .toBe('no tengo internet');
    });

    it('NO lo arranca si el parecido es flojo — responde el RAG normal', async () => {
      chunks.searchProcedureEntries.mockResolvedValue([
        { question: 'no tengo internet', similarity: 0.55, content: '', id: 'c1' },
      ]);

      expect(await runner.detectarEntrada('cuánto sale el plan más caro', sesion())).toBeNull();
    });

    // Medido en produccion: "el router es mio o prestado" (entrada 0.564, RAG
    // 0.669) y "dame datos de mi instalacion" se iban al procedimiento aunque
    // el RAG tenia mejor respuesta. Superar el umbral no alcanza: hay que
    // ganarle a la alternativa.
    it('NO arranca si el RAG tiene una respuesta mejor', async () => {
      chunks.searchProcedureEntries.mockResolvedValue([
        { question: 'no tengo internet', similarity: 0.71, content: '', id: 'c1' },
      ]);
      chunks.bestNonEntrySimilarity.mockResolvedValue(0.80);

      expect(await runner.detectarEntrada('el router es mio o prestado', sesion())).toBeNull();
    });

    it('arranca si le gana al RAG', async () => {
      chunks.searchProcedureEntries.mockResolvedValue([
        { question: 'no tengo internet', similarity: 0.75, content: '', id: 'c1' },
      ]);
      chunks.bestNonEntrySimilarity.mockResolvedValue(0.52);

      expect(await runner.detectarEntrada('no tengo internet', sesion())).toBe('no tengo internet');
    });

    it('sin procedimientos cargados no hace nada', async () => {
      chunks.searchProcedureEntries.mockResolvedValue([]);
      expect(await runner.detectarEntrada('no tengo internet', sesion())).toBeNull();
    });

    it('un saludo suelto no dispara nada', async () => {
      expect(await runner.detectarEntrada('ok', sesion())).toBeNull();
      expect(chunks.searchProcedureEntries).not.toHaveBeenCalled();
    });

    // Si falla la deteccion, el turno sigue por el camino normal del agente.
    it('un fallo de embeddings no cuelga el turno', async () => {
      embedder.embed.mockRejectedValue(new Error('429'));
      expect(await runner.detectarEntrada('no tengo internet', sesion())).toBeNull();
    });
  });


  // Medido en produccion: con el flujo andando, el cliente escribio "Rojo" en
  // vez de tocar 🔴 Roja y el procedimiento se perdio. La gente escribe.
  //
  // Se resuelve con comparacion lexica, NO con el modelo: son dos o tres
  // opciones conocidas, y meter a Gemini aca le devolveria al flujo la
  // indeterminacion que vinimos a sacarle.
  describe('respuesta escrita en vez de tocar el botón', () => {
    const enFlujo = () => sesion({
      procedimientoActual: { clave: 'no tengo internet', at: Date.now() },
    });

    beforeEach(() => {
      chunks.findByQuestion.mockResolvedValue({ id: 'c1', content: bloqueLuz });
    });

    it.each([
      ['Rojo', 'la luz esta roja'],
      ['rojA', 'la luz esta roja'],
      ['está en rojo', 'la luz esta roja'],
      ['Verde', 'la luz esta verde'],
      ['la luz es verde', 'la luz esta verde'],
    ])('mapea "%s" a la rama correcta', async (texto, esperado) => {
      expect(await runner.resolverRespuesta(enFlujo(), texto)).toBe(esperado);
    });

    it('una consulta ajena no mapea a ninguna rama', async () => {
      expect(await runner.resolverRespuesta(enFlujo(), 'cuánto cuesta el plan')).toBeNull();
    });

    it('sin procedimiento en curso no mapea nada', async () => {
      expect(await runner.resolverRespuesta(sesion(), 'rojo')).toBeNull();
    });

    // "sí" y "no" no aparecen en las etiquetas pero son la respuesta mas natural
    // a "¿mejoró?". Solo con dos opciones, donde no hay ambiguedad.
    describe('sí/no sueltos', () => {
      const bloqueSiNo = [
        '¿La luz está verde?',
        'Desenchufá el módem 10 segundos.',
        '>> BOTON: ✅ Sí, volvió -> ¿Reinicié el router y mejoró?',
        '>> BOTON: ❌ Sigue igual -> ¿Reinicié el router y sigue igual?',
      ].join('\n');

      beforeEach(() => {
        chunks.findByQuestion.mockResolvedValue({ id: 'c2', content: bloqueSiNo });
      });

      const enVerde = () => sesion({
        procedimientoActual: { clave: 'la luz esta verde', at: Date.now() },
      });

      it.each(['si', 'sí', 'dale', 'ok'])('"%s" va por la rama afirmativa', async (t) => {
        expect(await runner.resolverRespuesta(enVerde(), t)).toBe('reinicie el router y mejoro');
      });

      it.each(['no', 'nada', 'negativo'])('"%s" va por la rama negativa', async (t) => {
        expect(await runner.resolverRespuesta(enVerde(), t)).toBe('reinicie el router y sigue igual');
      });

      // Medido en produccion: el cliente respondio "Si" a "¿de que color esta
      // la luz?" y el codigo, al no encontrar marca afirmativa, eligio el
      // primer boton (🔴 Roja) por descarte. Un "si" a una pregunta de color no
      // significa nada: no hay que inventarle un significado.
      it.each(['si', 'no', 'dale'])('"%s" NO mapea si los botones no son de si/no', async (t) => {
        chunks.findByQuestion.mockResolvedValue({ id: 'c1', content: bloqueLuz });
        const enLuz = sesion({
          procedimientoActual: { clave: 'no tengo internet', at: Date.now() },
        });

        expect(await runner.resolverRespuesta(enLuz, t)).toBeNull();
      });
    });
  });

  // El documento se escribe con márgenes; esos cortes llegaban tal cual a
  // WhatsApp ("de qué / color está").
  it('junta los renglones de un párrafo y conserva los párrafos', async () => {
    chunks.findByQuestion.mockResolvedValue({
      id: 'c9',
      content: ['¿Hola?', 'primera linea', 'cortada al medio', '', 'segundo parrafo'].join('\n'),
    });

    const paso = await runner.ir('¿Hola?', sesion());

    expect(paso!.texto).toContain('primera linea cortada al medio');
    expect(paso!.texto).toContain('\n\nsegundo parrafo');
  });

});
