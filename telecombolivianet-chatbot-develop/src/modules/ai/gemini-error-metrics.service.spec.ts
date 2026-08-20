import { GeminiErrorMetricsService } from './gemini-error-metrics.service';

describe('GeminiErrorMetricsService', () => {
  let svc: GeminiErrorMetricsService;

  beforeEach(() => {
    svc = new GeminiErrorMetricsService();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-04T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('sin eventos → totalCalls/errors/errorRate en 0', () => {
    const stats = svc.getStats();
    expect(stats).toEqual({
      windowMinutes: 5, totalCalls: 0, errors: 0, errorRate: 0,
      byKind: { ok: 0, timeout: 0, '429': 0, other: 0 },
    });
  });

  it('cuenta éxitos y errores por tipo, calcula la tasa de error', () => {
    svc.recordSuccess();
    svc.recordSuccess();
    svc.recordError('429');
    svc.recordError('timeout');

    const stats = svc.getStats();
    expect(stats.totalCalls).toBe(4);
    expect(stats.errors).toBe(2);
    expect(stats.errorRate).toBe(0.5);
    expect(stats.byKind).toEqual({ ok: 2, timeout: 1, '429': 1, other: 0 });
  });

  it('no cuenta eventos fuera de la ventana solicitada', () => {
    svc.recordSuccess();
    jest.advanceTimersByTime(6 * 60_000); // 6 min después, fuera de la ventana default de 5
    svc.recordError('429');

    const stats = svc.getStats(); // ventana default 5 min
    expect(stats.totalCalls).toBe(1);
    expect(stats.byKind['429']).toBe(1);
    expect(stats.byKind.ok).toBe(0);
  });

  it('respeta una ventana custom en ms', () => {
    svc.recordSuccess();
    jest.advanceTimersByTime(2 * 60_000);
    svc.recordError('other');

    expect(svc.getStats(1 * 60_000).totalCalls).toBe(1);   // solo el error reciente
    expect(svc.getStats(10 * 60_000).totalCalls).toBe(2);  // ambos
  });

  it('emite un log de alerta cuando la tasa de error supera el umbral con muestras suficientes', () => {
    const errorSpy = jest.spyOn((svc as any).logger, 'error').mockImplementation(() => {});

    for (let i = 0; i < 4; i++) svc.recordSuccess();
    for (let i = 0; i < 2; i++) svc.recordError('429'); // 2/6 = 33% > 30%

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('gemini_error_rate_alert'));
  });

  it('NO alerta con pocas muestras aunque la tasa de error sea alta', () => {
    const errorSpy = jest.spyOn((svc as any).logger, 'error').mockImplementation(() => {});

    svc.recordError('429');
    svc.recordError('429'); // 100% de error, pero solo 2 muestras (< ALERT_MIN_SAMPLES)

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('NO alerta cuando la tasa de error está por debajo del umbral', () => {
    const errorSpy = jest.spyOn((svc as any).logger, 'error').mockImplementation(() => {});

    for (let i = 0; i < 9; i++) svc.recordSuccess();
    svc.recordError('429'); // 1/10 = 10% < 30%

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
