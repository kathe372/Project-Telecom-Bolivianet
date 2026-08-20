import { Injectable, Logger } from '@nestjs/common';
import { IRetryPolicy, RetryOptions } from './retry-policy.interface';

/**
 * BUG-2: política de reintentos con backoff exponencial + jitter para
 * errores transitorios de APIs externas (Gemini 429 RESOURCE_EXHAUSTED, 5xx).
 * El jitter (±30%) evita que muchos clientes reintenten en sincronía
 * ("thundering herd") y vuelvan a agotar la cuota.
 */
@Injectable()
export class ExponentialBackoffPolicy implements IRetryPolicy {
  private readonly logger = new Logger(ExponentialBackoffPolicy.name);

  private static readonly RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
  // Errores de conexión sin respuesta HTTP (nunca llegó a haber "status") que
  // SÍ son transitorios — a diferencia de un bug de código (TypeError, etc.),
  // que tampoco trae status pero NO debe reintentarse. Visto en prod: un
  // timeout de Gemini caía en la misma rama que un bug real y se devolvía
  // directo el mensaje genérico de "alta demanda" sin reintentar ni una vez.
  private static readonly RETRYABLE_CODES = new Set([
    'ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE',
  ]);
  private static readonly DEFAULT_MAX_ATTEMPTS = 3;
  private static readonly DEFAULT_BASE_MS = 500;
  private static readonly DEFAULT_CAP_MS = 8_000;
  private static readonly JITTER_RATIO = 0.3;

  /**
   * Un 429 no es un hipo: es el servidor diciendo "estás yendo más rápido de lo
   * que te toca". 500 ms no alcanzan para que se libere una ventana de cuota, y
   * el reintento llega igual de temprano y vuelve a rebotar.
   *
   * Medido en producción (2026-08-08): `retry_backoff waitMs:524 status:429` y
   * 2 segundos después el turno murió con RESOURCE_EXHAUSTED. El cliente leyó
   * "Tuve un problema técnico" por una espera demasiado corta.
   *
   * NO se toca el número de intentos a propósito: cada reintento consume la
   * misma cuota que se agotó, así que reintentar más sería empeorarlo. Lo que
   * cambia es cuánto se espera antes del intento que ya estaba previsto.
   */
  private static readonly DEFAULT_QUOTA_BASE_MS = 2_500;
  private static readonly QUOTA_STATUS = 429;

  async execute<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const maxAttempts = options.maxAttempts ?? ExponentialBackoffPolicy.DEFAULT_MAX_ATTEMPTS;
    const baseMs      = options.baseMs      ?? ExponentialBackoffPolicy.DEFAULT_BASE_MS;
    const capMs       = options.capMs       ?? ExponentialBackoffPolicy.DEFAULT_CAP_MS;
    const label       = options.label       ?? 'external-call';

    const quotaBudgetMs = options.quotaBudgetMs ?? 0;
    const arranque      = Date.now();

    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        if (!this.isRetryable(err)) throw err;

        const status = this.statusOf(err);
        // El cap también sube para el caso de cuota: con capMs=4000 un base de
        // 2500 quedaría recortado al segundo reintento y volveríamos al mismo
        // problema por otra puerta.
        const esCuota  = status === ExponentialBackoffPolicy.QUOTA_STATUS;
        const baseReal = esCuota
          ? Math.max(baseMs, options.quotaBaseMs ?? ExponentialBackoffPolicy.DEFAULT_QUOTA_BASE_MS)
          : baseMs;
        const capReal  = esCuota ? Math.max(capMs, baseReal * 2) : capMs;

        const backoff = Math.min(capReal, baseReal * 2 ** (attempt - 1));
        const jitter  = Math.random() * backoff * ExponentialBackoffPolicy.JITTER_RATIO;
        const waitMs  = Math.round(backoff + jitter);

        // Con presupuesto de cuota, manda el reloj y no el contador de intentos:
        // se sigue mientras la próxima espera entre dentro del presupuesto.
        // Sin presupuesto (o si el error no es de cuota) rige `maxAttempts`.
        const conPresupuesto = esCuota && quotaBudgetMs > 0;
        const transcurrido   = Date.now() - arranque;
        const alcanza        = conPresupuesto
          ? (transcurrido + waitMs) < quotaBudgetMs
          : attempt < maxAttempts;

        if (!alcanza) throw err;

        this.logger.warn(JSON.stringify({
          event: 'retry_backoff', label, attempt, waitMs, status,
          motivo: esCuota ? 'cuota' : 'transitorio',
          ...(conPresupuesto ? { transcurrido, quotaBudgetMs } : { maxAttempts }),
        }));
        await this.sleep(waitMs);
      }
    }
  }

  private isRetryable(err: unknown): boolean {
    const status = this.statusOf(err);
    if (status !== undefined) return ExponentialBackoffPolicy.RETRYABLE_STATUS.has(status);

    const code = (err as { code?: string })?.code;
    return code !== undefined && ExponentialBackoffPolicy.RETRYABLE_CODES.has(code);
  }

  private statusOf(err: unknown): number | undefined {
    return (err as { response?: { status?: number } })?.response?.status;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
