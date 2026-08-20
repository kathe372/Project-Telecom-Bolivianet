import { ExponentialBackoffPolicy } from './exponential-backoff.policy';

/**
 * Medido en producción (2026-08-08): el cliente tocó un horario, Vertex AI
 * devolvió 429 RESOURCE_EXHAUSTED, el reintento esperó 524 ms, volvió a rebotar
 * y el cliente leyó "😔 Tuve un problema técnico procesando tu consulta".
 *
 * Media cuota no se libera en medio segundo. El número de intentos NO se toca
 * —cada reintento consume la misma cuota agotada, y eso ya se había razonado al
 * bajarlos de 5 a 2— pero la espera del intento que igual iba a ocurrir tiene
 * que ser suficiente para que sirva de algo.
 */
describe('ExponentialBackoffPolicy — espera distinta para cuota agotada', () => {
  let policy: ExponentialBackoffPolicy;
  let dormido: number[];

  const httpError = (status: number) => ({ response: { status } });

  beforeEach(() => {
    policy = new ExponentialBackoffPolicy();
    dormido = [];
    // Se intercepta el sleep: interesa CUÁNTO se iba a esperar, no esperarlo.
    jest.spyOn(policy as any, 'sleep').mockImplementation(async (ms) => {
      dormido.push(ms as number);
    });
    jest.spyOn(Math, 'random').mockReturnValue(0);   // sin jitter, para comparar
  });

  afterEach(() => jest.restoreAllMocks());

  it('ante 429 espera segundos, no milisegundos', async () => {
    let llamadas = 0;
    const fn = jest.fn(async () => {
      if (++llamadas === 1) throw httpError(429);
      return 'ok';
    });

    await expect(policy.execute(fn, { maxAttempts: 2, baseMs: 500, capMs: 4_000 }))
      .resolves.toBe('ok');

    // Con la configuración real del agente (baseMs 500) la espera era 500 ms.
    expect(dormido[0]).toBeGreaterThanOrEqual(2_000);
  });

  it('no cambia la espera de los errores transitorios comunes', async () => {
    let llamadas = 0;
    const fn = jest.fn(async () => {
      if (++llamadas === 1) throw httpError(503);
      return 'ok';
    });

    await policy.execute(fn, { maxAttempts: 2, baseMs: 500, capMs: 4_000 });

    expect(dormido[0]).toBe(500);
  });

  // El cap se calculaba sobre el base viejo: con capMs 4000 un base de 2500
  // quedaba recortado y volvíamos al mismo problema por otra puerta.
  it('el tope no recorta la espera de cuota por debajo del base', async () => {
    let llamadas = 0;
    const fn = jest.fn(async () => {
      if (++llamadas < 3) throw httpError(429);
      return 'ok';
    });

    await policy.execute(fn, { maxAttempts: 3, baseMs: 500, capMs: 1_000 });

    for (const ms of dormido) expect(ms).toBeGreaterThanOrEqual(2_000);
  });

  it('respeta un quotaBaseMs explícito', async () => {
    let llamadas = 0;
    const fn = jest.fn(async () => {
      if (++llamadas === 1) throw httpError(429);
      return 'ok';
    });

    await policy.execute(fn, { maxAttempts: 2, baseMs: 500, quotaBaseMs: 6_000 });

    expect(dormido[0]).toBeGreaterThanOrEqual(6_000);
  });

  it('sigue sin reintentar lo que no es transitorio', async () => {
    const fn = jest.fn(async () => { throw httpError(400); });

    await expect(policy.execute(fn, { maxAttempts: 3 })).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(dormido).toEqual([]);
  });
});
