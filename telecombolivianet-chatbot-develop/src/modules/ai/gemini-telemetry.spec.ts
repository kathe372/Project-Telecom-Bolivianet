import { geminiTelemetry } from './gemini-telemetry';

describe('geminiTelemetry', () => {
  it('cuenta las llamadas record() dentro de un turno', async () => {
    const { result, calls } = await geminiTelemetry.run(async () => {
      geminiTelemetry.record();
      geminiTelemetry.record();
      geminiTelemetry.record();
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('record() fuera de un turno es no-op (no lanza)', () => {
    expect(() => geminiTelemetry.record()).not.toThrow();
    expect(geminiTelemetry.currentCalls()).toBe(0);
  });

  it('cuenta a través de continuaciones async (await/then)', async () => {
    const { calls } = await geminiTelemetry.run(async () => {
      geminiTelemetry.record();
      await Promise.resolve();
      geminiTelemetry.record();
      await new Promise((r) => setTimeout(r, 1));
      geminiTelemetry.record();
    });
    expect(calls).toBe(3);
  });

  it('turnos concurrentes no se mezclan (aislamiento por AsyncLocalStorage)', async () => {
    const turnA = geminiTelemetry.run(async () => {
      geminiTelemetry.record();
      await new Promise((r) => setTimeout(r, 5));
      geminiTelemetry.record();          // total A = 2
    });
    const turnB = geminiTelemetry.run(async () => {
      geminiTelemetry.record();          // total B = 1
    });
    const [a, b] = await Promise.all([turnA, turnB]);
    expect(a.calls).toBe(2);
    expect(b.calls).toBe(1);
  });

  it('currentCalls() refleja el acumulado dentro del turno', async () => {
    await geminiTelemetry.run(async () => {
      expect(geminiTelemetry.currentCalls()).toBe(0);
      geminiTelemetry.record();
      expect(geminiTelemetry.currentCalls()).toBe(1);
    });
  });
});
