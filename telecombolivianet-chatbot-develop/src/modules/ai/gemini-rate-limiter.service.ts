import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const POLL_INTERVAL_MS = 200;

/**
 * P3.1 (auditoría 2026-08): el lock por teléfono de DebounceHandler solo
 * serializa los mensajes de UN MISMO número — si varios clientes distintos
 * escriben a la vez, cada uno dispara su propia ráfaga de llamadas a Gemini
 * sin ninguna coordinación entre sí, y como el Dynamic Shared Quota de
 * Google es un pool COMPARTIDO medido en solicitudes/minuto, es ese pico
 * total agregado el que agota la cuota.
 *
 * Token bucket clásico (mismo patrón que AWS API Gateway/Stripe/NGINX): un
 * balde con `capacity` tokens que se rellena a un ritmo fijo
 * (`ratePerMinute`/60 por segundo). Cada llamada a Gemini consume un token
 * ANTES de intentarse — si no hay tokens disponibles, espera (poll) en vez
 * de dispararse igual y comerse un 429 seguro. Un solo proceso Node, así
 * que un contador en memoria alcanza — no hace falta Redis.
 */
@Injectable()
export class GeminiRateLimiterService {
  private readonly logger = new Logger(GeminiRateLimiterService.name);
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private tokens: number;
  private lastRefillAt: number;

  constructor(config: ConfigService) {
    const ratePerMinute = config.get<number>('gemini.rateLimitPerMinute') ?? 30;
    this.capacity     = Math.max(1, ratePerMinute);
    this.refillPerMs  = this.capacity / 60_000;
    this.tokens       = this.capacity;
    this.lastRefillAt = Date.now();
  }

  private refill(): void {
    const now     = Date.now();
    const elapsed = now - this.lastRefillAt;
    if (elapsed <= 0) return;
    this.tokens       = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefillAt = now;
  }

  /**
   * Espera hasta tener un token disponible y lo consume. Tope de espera
   * (`maxWaitMs`) como red de seguridad — mismo criterio "fail open" que el
   * resto del bot: nunca vale la pena colgar al cliente indefinidamente por
   * un límite propio, mejor dejar pasar la llamada y que el 429 (si pasa)
   * lo maneje el reintento normal.
   */
  async acquire(maxWaitMs = 30_000): Promise<void> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      if (Date.now() >= deadline) {
        this.logger.warn(
          'GeminiRateLimiter: se agotó la espera de un token, sigue de todos modos (fail open)',
        );
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}
