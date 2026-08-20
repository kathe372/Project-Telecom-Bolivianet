import { DebounceHandler } from './debounce.handler';
import { MessageContext } from './message-context';


let mockRedisInstance: any;

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockRedisInstance),
}));

const makeCtx = (overrides: Partial<MessageContext> = {}): MessageContext =>
  ({
    phone:          '59171000001',
    messageId:      'msg-001',
    type:           'text',
    text:           'Hola',
    humanAvailable: false,
    ...overrides,
  } as MessageContext);

const makeConfig = () => ({ get: jest.fn().mockReturnValue(undefined) });

describe('DebounceHandler', () => {
  let handler: DebounceHandler;

  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisInstance = {
      on:     jest.fn(),
      set:    jest.fn().mockResolvedValue('OK'),
      get:    jest.fn().mockResolvedValue(null),
      getdel: jest.fn().mockResolvedValue(null),
      del:    jest.fn().mockResolvedValue(1),
      // FASE G3: cola de textos de la ventana, para fusionarlos en vez de perderlos.
      rpush:   jest.fn().mockResolvedValue(1),
      pexpire: jest.fn().mockResolvedValue(1),
      lrange:  jest.fn().mockResolvedValue([]),
    };
    handler = new DebounceHandler(makeConfig() as any);
  });


  it('llama a next() cuando el mensaje es el último de la ráfaga (IDs coinciden)', async () => {
    mockRedisInstance.get.mockResolvedValue('msg-001');
    const ctx  = makeCtx({ messageId: 'msg-001' });
    const next = jest.fn().mockResolvedValue(undefined);

    const p = handler.handle(ctx, next);
    await jest.runAllTimersAsync();
    await p;

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('descarta el mensaje cuando hay uno más reciente (IDs distintos)', async () => {
    mockRedisInstance.get.mockResolvedValue('msg-002');
    const ctx  = makeCtx({ messageId: 'msg-001' });
    const next = jest.fn().mockResolvedValue(undefined);

    const p = handler.handle(ctx, next);
    await jest.runAllTimersAsync();
    await p;

    expect(next).not.toHaveBeenCalled();
  });

  it('guarda el messageId en Redis con la clave debounce:<phone>', async () => {
    mockRedisInstance.get.mockResolvedValue('msg-001');
    const ctx = makeCtx({ phone: '59170000099', messageId: 'msg-001' });

    const p = handler.handle(ctx, jest.fn().mockResolvedValue(undefined));
    await jest.runAllTimersAsync();
    await p;

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      'debounce:59170000099',
      'msg-001',
      'PX',
      expect.any(Number),
    );
  });


  it('llama a next() si Redis lanza error (fail-open)', async () => {
    mockRedisInstance.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const ctx  = makeCtx();
    const next = jest.fn().mockResolvedValue(undefined);

    const p = handler.handle(ctx, next);
    await jest.runAllTimersAsync();
    await p;

    expect(next).toHaveBeenCalledTimes(1);
  });


  it('fusiona imagen retenida con el caption del texto ganador', async () => {
    const held = { imageId: 'img-abc', imageCaption: null };
    mockRedisInstance.get.mockResolvedValue('msg-text');
    mockRedisInstance.getdel.mockResolvedValue(JSON.stringify(held));

    const ctx  = makeCtx({ messageId: 'msg-text', type: 'text', text: 'Mi comprobante' });
    const next = jest.fn().mockResolvedValue(undefined);

    const p = handler.handle(ctx, next);
    await jest.runAllTimersAsync();
    await p;

    expect(ctx.type).toBe('image');
    expect(ctx.imageId).toBe('img-abc');
    expect(ctx.imageCaption).toBe('Mi comprobante');
    expect(ctx.text).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('no modifica ctx si getdel devuelve null (sin imagen retenida)', async () => {
    mockRedisInstance.get.mockResolvedValue('msg-text-2');
    mockRedisInstance.getdel.mockResolvedValue(null);

    const ctx  = makeCtx({ messageId: 'msg-text-2', type: 'text', text: 'Hola' });
    const next = jest.fn().mockResolvedValue(undefined);

    const p = handler.handle(ctx, next);
    await jest.runAllTimersAsync();
    await p;

    expect(ctx.type).toBe('text');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('guarda datos de imagen en Redis con clave debounce:held_image: cuando tipo=image', async () => {
    mockRedisInstance.get.mockResolvedValue('msg-img');
    const ctx  = makeCtx({ messageId: 'msg-img', type: 'image', imageId: 'img-xyz' });
    const next = jest.fn().mockResolvedValue(undefined);

    const p = handler.handle(ctx, next);
    await jest.runAllTimersAsync();
    await p;

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      expect.stringContaining('debounce:held_image:'),
      expect.stringContaining('img-xyz'),
      'PX',
      expect.any(Number),
    );
  });

  it('registra el listener de error de Redis en el constructor', () => {
    expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
  });


  it('lee debounceWindowMs desde bot.debounceWindowMs en config', async () => {
    const configWith1000 = {
      get: jest.fn((key: string) => key === 'bot.debounceWindowMs' ? 1000 : undefined),
    };
    const customHandler = new DebounceHandler(configWith1000 as any);

    mockRedisInstance.get.mockResolvedValue('msg-custom');
    const ctx  = makeCtx({ messageId: 'msg-custom' });
    const next = jest.fn().mockResolvedValue(undefined);

    const p = customHandler.handle(ctx, next);
    await jest.runAllTimersAsync();
    await p;

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      'debounce:59171000001',
      'msg-custom',
      'PX',
      2000,
    );
  });

  // ── Lock de procesamiento (evita turnos en paralelo / respuestas duplicadas) ──

  it('toma el lock de procesamiento antes de llamar next() y lo libera después', async () => {
    mockRedisInstance.get.mockResolvedValue('msg-001');
    const ctx  = makeCtx({ messageId: 'msg-001' });
    const next = jest.fn().mockResolvedValue(undefined);

    const p = handler.handle(ctx, next);
    await jest.runAllTimersAsync();
    await p;

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      'debounce:processing:59171000001', '1', 'PX', expect.any(Number), 'NX',
    );
    expect(mockRedisInstance.del).toHaveBeenCalledWith('debounce:processing:59171000001');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('si el lock de procesamiento está ocupado, espera (poll) a que se libere antes de procesar', async () => {
    mockRedisInstance.get.mockResolvedValue('msg-001');
    mockRedisInstance.set
      .mockResolvedValueOnce('OK')   // set del messageId (debounce normal)
      .mockResolvedValueOnce(null)   // 1er intento de lock: ocupado (turno anterior en curso)
      .mockResolvedValueOnce(null)   // 2do intento: sigue ocupado
      .mockResolvedValueOnce('OK');  // 3er intento: se liberó, lo toma

    const ctx  = makeCtx({ messageId: 'msg-001' });
    const next = jest.fn().mockResolvedValue(undefined);

    const p = handler.handle(ctx, next);
    await jest.runAllTimersAsync();
    await p;

    const lockAttempts = mockRedisInstance.set.mock.calls.filter(
      (c: any[]) => c[0] === 'debounce:processing:59171000001',
    );
    expect(lockAttempts.length).toBe(3);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('si el lock nunca se libera, sigue de todos modos tras agotar la espera (fail open, no cuelga al cliente)', async () => {
    mockRedisInstance.get.mockResolvedValue('msg-001');
    mockRedisInstance.set.mockImplementation((...args: any[]) =>
      Promise.resolve(String(args[0]).startsWith('debounce:processing:') ? null : 'OK'),
    );

    const ctx  = makeCtx({ messageId: 'msg-001' });
    const next = jest.fn().mockResolvedValue(undefined);

    const p = handler.handle(ctx, next);
    await jest.runAllTimersAsync();
    await p;

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRedisInstance.del).not.toHaveBeenCalledWith('debounce:processing:59171000001');
  }, 15_000);

  it('usa 2500ms por defecto cuando config devuelve undefined → TTL = 5000', async () => {
    mockRedisInstance.get.mockResolvedValue('msg-default');
    const ctx  = makeCtx({ messageId: 'msg-default' });
    const next = jest.fn().mockResolvedValue(undefined);

    const p = handler.handle(ctx, next);
    await jest.runAllTimersAsync();
    await p;

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      'debounce:59171000001',
      'msg-default',
      'PX',
      5000,
    );
  });

  // ── FASE G3 (2026-08-07) ────────────────────────────────────────────────────
  // Dos fallos reales medidos en producción el mismo día:
  //
  //  1. El cliente tocó "✅ Confirmar cancelación", escribió otra cosa 4 s
  //     después, y el debounce se comió el CLIC. La cancelación nunca se
  //     ejecutó y el bot no dijo nada: el cliente creyó haber cancelado.
  //  2. Se enviaron 3 mensajes de texto en 6 s y solo se persistió 1. Los dos
  //     primeros se descartaron en silencio, sin fusionarse.
  describe('G3 — ningún mensaje del cliente puede perderse', () => {

    it('una respuesta interactiva NO pasa por el debounce: se procesa siempre', async () => {
      // Escenario exacto: hay un mensaje más reciente en la ventana, que antes
      // hacía que este clic se descartara.
      mockRedisInstance.get.mockResolvedValue('otro-msg-mas-reciente');
      const ctx  = makeCtx({
        messageId: 'msg-clic', type: 'interactive',
        interactiveId: 'confirmar_cancelacion_instalacion',
        text: '✅ Confirmar cancelación',
      });
      const next = jest.fn().mockResolvedValue(undefined);

      const p = handler.handle(ctx, next);
      await jest.runAllTimersAsync();
      await p;

      expect(next).toHaveBeenCalledTimes(1);
      // Ni siquiera entra a la ventana de espera.
      expect(mockRedisInstance.set).not.toHaveBeenCalled();
    });

    it('los textos de la ráfaga se acumulan en la cola', async () => {
      mockRedisInstance.get.mockResolvedValue('msg-001');
      const ctx = makeCtx({ messageId: 'msg-001', text: 'tengo un problema' });

      const p = handler.handle(ctx, jest.fn().mockResolvedValue(undefined));
      await jest.runAllTimersAsync();
      await p;

      expect(mockRedisInstance.rpush).toHaveBeenCalledWith(
        'debounce:held_text:59171000001', 'tengo un problema',
      );
    });

    it('el mensaje que sobrevive hereda el texto de los descartados', async () => {
      mockRedisInstance.get.mockResolvedValue('msg-003');
      mockRedisInstance.lrange.mockResolvedValue([
        'hola', 'tengo un problema', 'con el internet desde ayer',
      ]);
      const ctx  = makeCtx({ messageId: 'msg-003', text: 'con el internet desde ayer' });
      const next = jest.fn().mockResolvedValue(undefined);

      const p = handler.handle(ctx, next);
      await jest.runAllTimersAsync();
      await p;

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.text).toBe('hola tengo un problema con el internet desde ayer');
      expect(mockRedisInstance.del).toHaveBeenCalledWith('debounce:held_text:59171000001');
    });

    it('un solo mensaje en la ventana queda intacto (no se toca el texto)', async () => {
      mockRedisInstance.get.mockResolvedValue('msg-001');
      mockRedisInstance.lrange.mockResolvedValue(['Hola']);
      const ctx = makeCtx({ messageId: 'msg-001', text: 'Hola' });

      const p = handler.handle(ctx, jest.fn().mockResolvedValue(undefined));
      await jest.runAllTimersAsync();
      await p;

      expect(ctx.text).toBe('Hola');
    });
  });

});
