export const RETRY_POLICY = Symbol('RETRY_POLICY');

export interface RetryOptions {
  /** Intentos totales (incluido el primero). Default 3. */
  maxAttempts?: number;
  /** Backoff base en ms para el primer reintento. Default 500. */
  baseMs?: number;
  /** Tope de backoff en ms. Default 8000. */
  capMs?: number;
  /**
   * Backoff base en ms cuando el error es 429 (cuota agotada). Default 2500.
   * Va aparte de `baseMs` porque una cuota no se libera en medio segundo:
   * reintentar tan pronto solo gasta el intento sin chance de que funcione.
   */
  quotaBaseMs?: number;
  /**
   * Presupuesto TOTAL en ms para seguir reintentando un 429, contando las
   * esperas. Mientras quede presupuesto se reintenta aunque se pase de
   * `maxAttempts`; cuando se acaba, el error se propaga.
   *
   * Existe porque contar intentos y contar tiempo no son lo mismo: 5 intentos
   * en 2 segundos martillan una cuota agotada, y 5 intentos repartidos en 30
   * segundos le dan tiempo real a que se libere. Solo aplica a 429 — para un
   * 5xx reintentar 30 segundos sería castigar a un servidor que ya sufre.
   */
  quotaBudgetMs?: number;
  /** Etiqueta para logging/telemetría. */
  label?: string;
}

export interface IRetryPolicy {
  /**
   * Ejecuta `fn` reintentando SOLO errores HTTP transitorios (429/5xx)
   * con backoff exponencial + jitter. Errores no transitorios se propagan
   * de inmediato.
   */
  execute<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
}
