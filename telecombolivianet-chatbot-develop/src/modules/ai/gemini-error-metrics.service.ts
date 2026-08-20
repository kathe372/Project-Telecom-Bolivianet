import { Injectable, Logger } from '@nestjs/common';

const RETENTION_MS = 15 * 60_000; // se guardan 15 min, se reporta sobre una ventana menor
const ALERT_THRESHOLD = 0.3;      // 30% de error en la ventana → log de alerta
const ALERT_MIN_SAMPLES = 5;      // no alertar con muy pocas muestras (ruido)

type EventKind = 'ok' | 'timeout' | '429' | 'other';

interface Event { at: number; kind: EventKind; }

/**
 * P4.1 (auditoría 2026-08): antes la única forma de enterarse de una
 * racha de 429/timeout de Gemini era grepear los logs de Railway a mano
 * (como pasó en esta sesión). Con Dynamic Shared Quota no hay un "% de
 * cuota" que consultar en Google Cloud (se comprobó en la consola real que
 * no existe esa fila) — así que el proxy correcto es medir NUESTRA propia
 * tasa de error en una ventana de tiempo reciente, no la cuota de Google.
 *
 * Singleton simple en memoria (un solo proceso Node, igual que el token
 * bucket de P3.1) — no hace falta Redis ni una base de series de tiempo
 * para el volumen de este bot.
 */
@Injectable()
export class GeminiErrorMetricsService {
  private readonly logger = new Logger(GeminiErrorMetricsService.name);
  private events: Event[] = [];

  recordSuccess(): void {
    this.push('ok');
  }

  recordError(kind: 'timeout' | '429' | 'other'): void {
    this.push(kind);
    this.maybeAlert();
  }

  private push(kind: EventKind): void {
    const now = Date.now();
    this.events.push({ at: now, kind });
    this.prune(now);
  }

  private prune(now: number): void {
    const cutoff = now - RETENTION_MS;
    while (this.events.length && this.events[0].at < cutoff) this.events.shift();
  }

  /** Estadísticas de la ventana solicitada (por default, últimos 5 min). */
  getStats(windowMs = 5 * 60_000): {
    windowMinutes: number; totalCalls: number; errors: number; errorRate: number;
    byKind: Record<EventKind, number>;
  } {
    const now = Date.now();
    this.prune(now);
    const cutoff = now - windowMs;
    const inWindow = this.events.filter((e) => e.at >= cutoff);

    const byKind: Record<EventKind, number> = { ok: 0, timeout: 0, '429': 0, other: 0 };
    for (const e of inWindow) byKind[e.kind]++;

    const totalCalls = inWindow.length;
    const errors     = totalCalls - byKind.ok;

    return {
      windowMinutes: Math.round(windowMs / 60_000),
      totalCalls,
      errors,
      errorRate: totalCalls > 0 ? errors / totalCalls : 0,
      byKind,
    };
  }

  private maybeAlert(): void {
    const stats = this.getStats();
    if (stats.totalCalls < ALERT_MIN_SAMPLES) return;
    if (stats.errorRate < ALERT_THRESHOLD) return;

    // Log distintivo y fácil de buscar/alertar (ej. con una regla de logs de
    // Railway) — no hay webhook de Slack configurado en este proyecto, así
    // que esto es lo que hoy avisa "solo" sin depender de grepear a mano.
    this.logger.error(JSON.stringify({
      event: 'gemini_error_rate_alert',
      windowMinutes: stats.windowMinutes,
      totalCalls:    stats.totalCalls,
      errors:        stats.errors,
      errorRate:     Number(stats.errorRate.toFixed(2)),
      byKind:        stats.byKind,
    }));
  }
}
