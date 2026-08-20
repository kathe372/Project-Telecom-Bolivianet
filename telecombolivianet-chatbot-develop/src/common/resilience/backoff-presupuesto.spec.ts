import { ExponentialBackoffPolicy } from './exponential-backoff.policy';

/**
 * "En vez de que salga 'tuve un problema técnico', reintentá por debajo hasta
 * obtener respuesta y no le informes nada al usuario."
 *
 * Se implementa con un presupuesto de TIEMPO y no de intentos. La diferencia
 * importa: el daño de reintentar una cuota agotada no está en el número de
 * intentos sino en la frecuencia — 5 intentos en 2 segundos la martillan, los
 * mismos 5 repartidos en 30 segundos le dan lugar a que se libere. Por eso los
 * intentos ya no se cuentan cuando hay presupuesto.
 *
 * El presupuesto es finito a propósito: del otro lado hay alguien mirando
 * WhatsApp, y quedarse callado para siempre es peor que avisar.
 */
describe('ExponentialBackoffPolicy — presupuesto de tiempo para cuota', () => {
  let policy: ExponentialBackoffPolicy;
  let reloj: number;

  const httpError = (status: number) => ({ response: { status } });

  beforeEach(() => {
    policy = new ExponentialBackoffPolicy();
    reloj = 0;
    // Reloj simulado: el sleep adelanta el tiempo en vez de esperarlo, así el
    // test mide el comportamiento sin tardar 45 segundos reales.
    jest.spyOn(Date, 'now').mockImplementation(() => reloj);
    jest.spyOn(policy as any, 'sleep').mockImplementation(async (ms) => {
      reloj += ms as number;
    });
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => jest.restoreAllMocks());

  it('supera maxAttempts mientras quede presupuesto', async () => {
    let llamadas = 0;
    const fn = jest.fn(async () => {
      if (++llamadas < 5) throw httpError(429);
      return 'ok';
    });

    await expect(policy.execute(fn, {
      maxAttempts: 2, baseMs: 500, capMs: 4_000, quotaBudgetMs: 45_000,
    })).resolves.toBe('ok');

    // Con maxAttempts:2 esto habria muerto en el segundo intento y el cliente
    // habria leido "tuve un problema tecnico".
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('se rinde cuando el presupuesto se agota, no antes', async () => {
    const fn = jest.fn(async () => { throw httpError(429); });

    await expect(policy.execute(fn, {
      maxAttempts: 2, baseMs: 500, capMs: 4_000, quotaBudgetMs: 10_000,
    })).rejects.toBeDefined();

    expect(reloj).toBeLessThanOrEqual(10_000);
    expect(fn.mock.calls.length).toBeGreaterThan(2);
  });

  // Un 5xx no es una cuota: insistir 45 segundos seria castigar a un servidor
  // que ya esta sufriendo.
  it('el presupuesto NO se aplica a errores que no son de cuota', async () => {
    const fn = jest.fn(async () => { throw httpError(503); });

    await expect(policy.execute(fn, {
      maxAttempts: 2, baseMs: 500, quotaBudgetMs: 45_000,
    })).rejects.toBeDefined();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('sin presupuesto se comporta como antes', async () => {
    const fn = jest.fn(async () => { throw httpError(429); });

    await expect(policy.execute(fn, { maxAttempts: 2, baseMs: 500 }))
      .rejects.toBeDefined();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('un error no reintentable sigue saliendo al instante', async () => {
    const fn = jest.fn(async () => { throw httpError(400); });

    await expect(policy.execute(fn, { quotaBudgetMs: 45_000 })).rejects.toBeDefined();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(reloj).toBe(0);
  });
});
