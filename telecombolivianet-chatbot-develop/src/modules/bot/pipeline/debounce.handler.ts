import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { MessageContext } from './message-context';
import { MessageHandler } from './message-handler';

const DEBOUNCE_TTL_FACTOR = 2;

const HELD_IMAGE_PREFIX = 'debounce:held_image:';
/** FASE G3: cola de textos de la ventana, para fusionarlos en vez de perderlos. */
const HELD_TEXT_PREFIX = 'debounce:held_text:';
const PROCESSING_LOCK_PREFIX = 'debounce:processing:';
// Un turno completo (varias llamadas a Gemini + tools) puede tardar bastante
// más que la ventana de debounce (2.5s) — se vio en prod hasta 40-60s. Si un
// segundo mensaje del mismo número llega DESPUÉS de esa ventana pero
// mientras el primero todavía se está procesando, antes arrancaba su propio
// turno en paralelo y el cliente recibía la respuesta duplicada (dos veces
// "aquí tienes los planes", etc.). Este lock hace que el segundo mensaje
// espere a que el primero termine, en vez de correr en paralelo.
const PROCESSING_LOCK_TTL_MS   = 90_000; // tope de seguridad si un turno se cuelga
const PROCESSING_LOCK_POLL_MS  = 500;

@Injectable()
export class DebounceHandler implements MessageHandler {
  private readonly logger = new Logger(DebounceHandler.name);
  private readonly redis: Redis;
  private readonly debounceWindowMs: number;

  constructor(private readonly config: ConfigService) {
    this.debounceWindowMs = config.get<number>('bot.debounceWindowMs') ?? 2_500;

    this.redis = new Redis({
      host:          config.get<string>('redis.host'),
      port:          config.get<number>('redis.port'),
      password:      config.get<string>('redis.password') || undefined,
      db:            config.get<number>('redis.db'),
      retryStrategy: (times) => Math.min(times * 200, 5_000),
      lazyConnect:   true,
    });

    this.redis.on('error', (err: Error) =>
      this.logger.warn(`Redis debounce error: ${err.message}`),
    );
  }

  async handle(ctx: MessageContext, next: () => Promise<void>): Promise<void> {
    // ── FASE G3 (2026-08-07) ────────────────────────────────────────────────
    // Un mensaje INTERACTIVO (botón o fila de lista) nunca puede descartarse.
    //
    // Medido en producción: el cliente tocó "✅ Confirmar cancelación", escribió
    // otra cosa 4 segundos después, y el debounce se comió el clic. La
    // cancelación nunca se ejecutó y el bot no dijo absolutamente nada — el
    // cliente creyó haber cancelado y el sistema no se enteró.
    //
    // El debounce existe para agrupar el tecleo humano fragmentado. Un clic no
    // es tecleo: es una decisión única, deliberada y no repetible. Se procesa
    // siempre, sin esperar la ventana.
    if (ctx.interactiveId) {
      this.logger.debug(`Debounce: omitido para respuesta interactiva de ${ctx.phone}`);
      await next();
      return;
    }

    const key      = `debounce:${ctx.phone}`;
    const imageKey = `${HELD_IMAGE_PREFIX}${ctx.phone}`;
    const textKey  = `${HELD_TEXT_PREFIX}${ctx.phone}`;
    const lockKey  = `${PROCESSING_LOCK_PREFIX}${ctx.phone}`;
    const debounceTtlMs = this.debounceWindowMs * DEBOUNCE_TTL_FACTOR;
    let lockAcquired = false;

    try {
      if (ctx.type === 'image' && ctx.imageId) {
        await this.redis.set(
          imageKey,
          JSON.stringify({ imageId: ctx.imageId, imageCaption: ctx.imageCaption ?? null }),
          'PX', debounceTtlMs,
        );
      }

      // FASE G3: el texto se ACUMULA antes de esperar. Si este mensaje termina
      // descartado por uno más reciente, su contenido ya quedó en la cola y lo
      // hereda el que sí se procese.
      //
      // Antes solo se fusionaba imagen + caption; texto + texto se descartaba.
      // Medido en producción: 3 mensajes en 6 segundos → se persistió 1. Y
      // partir una idea en varios mensajes es EL comportamiento típico de
      // WhatsApp ("hola" / "tengo un problema" / "con el internet desde ayer").
      if (ctx.type === 'text' && ctx.text?.trim()) {
        await this.redis.rpush(textKey, ctx.text.trim());
        await this.redis.pexpire(textKey, debounceTtlMs);
      }

      await this.redis.set(key, ctx.messageId, 'PX', debounceTtlMs);
      await new Promise<void>(resolve => setTimeout(resolve, this.debounceWindowMs));

      const current = await this.redis.get(key);
      if (current !== ctx.messageId) {
        this.logger.debug(
          `Debounce: descartando msg ${ctx.messageId} de ${ctx.phone} ` +
          `(hay uno más reciente; su texto queda en la cola para fusionarse)`,
        );
        return;
      }

      // Este mensaje es el que sobrevive: recoge todo lo acumulado en la ventana.
      if (ctx.type === 'text') {
        const acumulado = await this.redis.lrange(textKey, 0, -1);
        await this.redis.del(textKey);
        if (acumulado.length > 1) {
          ctx.text = acumulado.join(' ');
          this.logger.log(JSON.stringify({
            event: 'debounce_merged_texts', phone: ctx.phone, partes: acumulado.length,
          }));
        }
      }

      if (ctx.type === 'text') {
        const heldJson = await this.redis.getdel(imageKey);
        if (heldJson) {
          const held = JSON.parse(heldJson) as { imageId: string; imageCaption: string | null };
          this.logger.debug(
            `Debounce: fusionando imagen ${held.imageId} con caption "${ctx.text}" para ${ctx.phone}`,
          );
          ctx.type         = 'image';
          ctx.imageId      = held.imageId;
          ctx.imageCaption = ctx.text;
          ctx.text         = undefined;
        }
      }

      lockAcquired = await this.acquireProcessingLock(lockKey);
      if (!lockAcquired) {
        this.logger.warn(
          `Debounce: se agotó la espera del lock de procesamiento para ${ctx.phone}, ` +
          `sigue de todos modos (fail open)`,
        );
      }
    } catch (err: unknown) {
      this.logger.warn(`Debounce Redis error (fail open): ${(err as Error).message}`);
    }

    try {
      await next();
    } finally {
      if (lockAcquired) {
        await this.redis.del(lockKey).catch((err: unknown) =>
          this.logger.warn(`Debounce: no se pudo liberar el lock de ${ctx.phone}: ${(err as Error).message}`),
        );
      }
    }
  }

  /** Espera (poll) hasta que no haya un turno en curso para este número y toma
   *  el lock — o hasta agotar PROCESSING_LOCK_TTL_MS, en cuyo caso sigue sin
   *  bloquear (mismo criterio "fail open" que el resto del handler: nunca
   *  vale la pena colgar al cliente indefinidamente por un problema nuestro). */
  private async acquireProcessingLock(lockKey: string): Promise<boolean> {
    const deadline = Date.now() + PROCESSING_LOCK_TTL_MS;
    for (;;) {
      const res = await this.redis.set(lockKey, '1', 'PX', PROCESSING_LOCK_TTL_MS, 'NX');
      if (res === 'OK') return true;
      if (Date.now() >= deadline) return false;
      await new Promise<void>(resolve => setTimeout(resolve, PROCESSING_LOCK_POLL_MS));
    }
  }
}
