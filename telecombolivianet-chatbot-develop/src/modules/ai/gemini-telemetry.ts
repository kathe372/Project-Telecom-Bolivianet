import { AsyncLocalStorage } from 'async_hooks';

/**
 * Telemetría de llamadas a Gemini por turno (Paso 5 del PLAN_OPTIMIZACION_GEMINI).
 *
 * Singleton de módulo (no DI) a propósito: el conteo es una preocupación
 * transversal que atraviesa 6 servicios independientes. Con `AsyncLocalStorage`
 * se instrumenta sin tocar constructores ni romper specs — cada sitio de llamada
 * solo invoca `record()`, un no-op fuera de un turno.
 *
 * Cuenta llamadas LÓGICAS (una por generación/embedding), no reintentos: `record()`
 * se llama una vez por sitio, antes del `retry.execute`.
 *
 * Nota sobre el sentimiento (fire-and-forget): aunque no se hace `await`, se despacha
 * DENTRO del scope del turno, así que el `AsyncLocalStorage` propaga el contexto a su
 * cadena async y su `record()` corre durante el await del agente → SÍ se cuenta.
 * Verificado en prod (2026-07-25): turno sin herramienta = 2 (sentimiento + agente),
 * turno con 1 herramienta = 3.
 */
class GeminiTelemetry {
  private readonly als = new AsyncLocalStorage<{ count: number }>();

  /** Ejecuta `fn` dentro de un turno contable y devuelve el nº de llamadas a Gemini. */
  async run<T>(fn: () => Promise<T>): Promise<{ result: T; calls: number }> {
    const store = { count: 0 };
    const result = await this.als.run(store, fn);
    return { result, calls: store.count };
  }

  /** Registra una llamada lógica a Gemini en el turno actual (no-op fuera de turno). */
  record(): void {
    const store = this.als.getStore();
    if (store) store.count++;
  }

  /** Nº de llamadas acumuladas en el turno actual (0 fuera de turno). */
  currentCalls(): number {
    return this.als.getStore()?.count ?? 0;
  }
}

export const geminiTelemetry = new GeminiTelemetry();
