import { GeminiRateLimiterService } from './gemini-rate-limiter.service';

function makeConfig(ratePerMinute?: number) {
  return { get: jest.fn(() => ratePerMinute) } as any;
}

describe('GeminiRateLimiterService', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('consume un token disponible de inmediato, sin esperar', async () => {
    const limiter = new GeminiRateLimiterService(makeConfig(30));

    const p = limiter.acquire();
    await jest.runAllTimersAsync();
    await expect(p).resolves.toBeUndefined();
  });

  it('permite ráfagas hasta la capacidad (=ratePerMinute) sin esperar', async () => {
    const limiter = new GeminiRateLimiterService(makeConfig(5));

    const results = await Promise.all(
      Array.from({ length: 5 }, () => {
        const p = limiter.acquire();
        return p;
      }),
    );
    await jest.runAllTimersAsync();
    expect(results).toHaveLength(5);
  });

  it('espera (poll) a que se rellene un token cuando la capacidad está agotada', async () => {
    const limiter = new GeminiRateLimiterService(makeConfig(60)); // 1 token/seg

    await limiter.acquire(); // consume el único token inicial disponible de a 1... (ver capacity real abajo)
    // Fuerza a 0 tokens explícitamente para no depender del refill entre awaits.
    (limiter as any).tokens = 0;

    const p = limiter.acquire(5_000);
    await jest.advanceTimersByTimeAsync(1_200); // >1s a 60/min = 1 token/seg
    await expect(p).resolves.toBeUndefined();
  });

  it('sigue de todos modos (fail open) si se agota la espera sin token disponible', async () => {
    const limiter = new GeminiRateLimiterService(makeConfig(1)); // 1 token/min → muy lento para refill
    (limiter as any).tokens = 0;

    const p = limiter.acquire(2_000); // tope de espera corto, no alcanza a rellenar
    await jest.advanceTimersByTimeAsync(2_500);
    await expect(p).resolves.toBeUndefined();
  });

  it('usa 30/min por default cuando no hay config', () => {
    const limiter = new GeminiRateLimiterService(makeConfig(undefined));
    expect((limiter as any).capacity).toBe(30);
  });
});
