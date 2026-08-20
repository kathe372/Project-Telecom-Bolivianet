import { ExponentialBackoffPolicy } from './exponential-backoff.policy';

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), {
  response: { status },
});

describe('ExponentialBackoffPolicy', () => {
  let policy: ExponentialBackoffPolicy;

  beforeEach(() => {
    policy = new ExponentialBackoffPolicy();
  });

  it('devuelve el resultado al primer intento exitoso', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(policy.execute(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // Lo que verifica es el NÚMERO de intentos, no la espera. Desde que el 429
  // tiene su propio backoff (2,5 s por defecto, ver backoff-cuota.spec.ts) hay
  // que bajarlo explícito o el test tarda 5 segundos reales y se cae por
  // timeout.
  it('reintenta ante 429 y termina resolviendo', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(httpError(429))
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValue('recuperado');
    await expect(policy.execute(fn, { baseMs: 1, capMs: 5, quotaBaseMs: 1 }))
      .resolves.toBe('recuperado');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('reintenta ante 503', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValue('ok');
    await expect(policy.execute(fn, { baseMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('propaga tras agotar maxAttempts', async () => {
    const fn = jest.fn().mockRejectedValue(httpError(429));
    await expect(policy.execute(fn, { maxAttempts: 3, baseMs: 1, capMs: 3, quotaBaseMs: 1 }))
      .rejects.toThrow('HTTP 429');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('NO reintenta errores no transitorios (400/401/404)', async () => {
    for (const status of [400, 401, 404]) {
      const fn = jest.fn().mockRejectedValue(httpError(status));
      await expect(policy.execute(fn, { baseMs: 1 })).rejects.toThrow(`HTTP ${status}`);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it('NO reintenta errores sin status HTTP (bugs de código)', async () => {
    const fn = jest.fn().mockRejectedValue(new TypeError('undefined is not a function'));
    await expect(policy.execute(fn, { baseMs: 1 })).rejects.toThrow(TypeError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('SÍ reintenta un timeout de axios (sin status, pero con code ECONNABORTED)', async () => {
    const timeoutErr = Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED' });
    const fn = jest.fn().mockRejectedValueOnce(timeoutErr).mockResolvedValue('recuperado');
    await expect(policy.execute(fn, { baseMs: 1 })).resolves.toBe('recuperado');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('SÍ reintenta una conexión reseteada (ECONNRESET) o rechazada (ECONNREFUSED)', async () => {
    for (const code of ['ECONNRESET', 'ECONNREFUSED']) {
      const fn = jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error(code), { code }))
        .mockResolvedValue('ok');
      await expect(policy.execute(fn, { baseMs: 1 })).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    }
  });

  // Usa 503 y no 429 a propósito: acá se verifica la curva GENÉRICA (base →
  // cap). El 429 dejó de seguirla — tiene su propio base porque una cuota no se
  // libera en medio segundo — así que probarla con 429 mediría otra cosa.
  it('el backoff crece exponencialmente con cap', async () => {
    const waits: number[] = [];
    const original = global.setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation(((cb: () => void, ms?: number) => {
      waits.push(ms ?? 0);
      return original(cb, 0);
    }) as typeof setTimeout);

    const fn = jest.fn()
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValue('ok');
    await policy.execute(fn, { baseMs: 100, capMs: 150 });

    expect(waits[0]).toBeGreaterThanOrEqual(100); // base
    expect(waits[0]).toBeLessThanOrEqual(130);    // base + 30% jitter
    expect(waits[1]).toBeGreaterThanOrEqual(150); // cap alcanzado
    expect(waits[1]).toBeLessThanOrEqual(195);    // cap + jitter
    (global.setTimeout as unknown as jest.SpyInstance).mockRestore();
  });
});
