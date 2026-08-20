import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';


export interface OutboxEntry {
  text:     string;
  attempts: number;
  addedAt:  number;
}

const OUTBOX_TTL_SECONDS   = 1800;
const PROCESSING_STALE_MS  = 60_000;
const KEY_PREFIX           = 'wa:outbox:';
// Prefijo de lock distinto para que NO colisione con el SCAN 'wa:outbox:*'
// de getAllPhones (si compartiera prefijo, aparecerían "teléfonos" fantasma).
const LOCK_PREFIX          = 'wa:outboxlock:';
const MAX_OUTBOX_CHARS     = 3_500;   // bajo el límite de 4096 de WhatsApp
const SCAN_COUNT           = 100;

@Injectable()
export class OutboxRepositoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRepositoryService.name);
  private redis: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.redis = new Redis({
      host:     this.config.get<string>('redis.host'),
      port:     this.config.get<number>('redis.port'),
      password: this.config.get<string>('redis.password') || undefined,
      db:       this.config.get<number>('redis.db'),
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
    this.redis.on('error', (err) => this.logger.error('OutboxRedis error', err.message));
  }

  onModuleDestroy(): void { this.redis?.disconnect(); }

  private key(phone: string): string { return `${KEY_PREFIX}${phone}`; }
  private lockKey(phone: string): string { return `${LOCK_PREFIX}${phone}`; }

  async push(phone: string, text: string): Promise<void> {
    // El outbox existe para GARANTIZAR la entrega cuando WhatsApp está caído.
    // Antes se sobrescribía la entrada por teléfono: si a un cliente le fallaban
    // 2 mensajes, el primero se perdía en silencio — justo durante una caída,
    // que es cuando más importa. Ahora se combinan para no perder ninguno.
    const existing = await this.get(phone);
    if (existing) {
      let combined = `${existing.text}\n\n${text}`;
      if (combined.length > MAX_OUTBOX_CHARS) {
        this.logger.warn(`Outbox de ${phone} truncado a ${MAX_OUTBOX_CHARS} chars (acumulación durante caída)`);
        combined = combined.slice(0, MAX_OUTBOX_CHARS);
      }
      const merged: OutboxEntry = { text: combined, attempts: existing.attempts, addedAt: existing.addedAt };
      await this.redis.setex(this.key(phone), OUTBOX_TTL_SECONDS, JSON.stringify(merged));
      return;
    }
    const entry: OutboxEntry = { text, attempts: 0, addedAt: Date.now() };
    await this.redis.setex(this.key(phone), OUTBOX_TTL_SECONDS, JSON.stringify(entry));
  }

  async get(phone: string): Promise<OutboxEntry | null> {
    const raw = await this.redis.get(this.key(phone));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OutboxEntry;
    } catch {
      this.logger.warn(`Outbox corrupto para ${phone} — descartando`);
      await this.redis.del(this.key(phone));
      return null;
    }
  }

  /**
   * R2: adquiere un lock ATÓMICO (SET NX) SIN mirar la entrada. El llamador debe
   * leer la entrada DESPUÉS de adquirir el lock (no antes), porque leer antes
   * abre una carrera: otro hilo puede entregar+remover entre la lectura y el
   * lock, y este hilo reenviaría la entrada vieja. El PX libera el lock si el
   * proceso muere (protección contra stale).
   */
  async markAsProcessing(phone: string): Promise<boolean> {
    const acquired = await this.redis.set(this.lockKey(phone), '1', 'PX', PROCESSING_STALE_MS, 'NX');
    return acquired === 'OK';
  }

  async revertToPending(phone: string): Promise<void> {
    // Liberar el lock para permitir un nuevo intento de entrega.
    await this.redis.del(this.lockKey(phone));
  }

  async remove(phone: string): Promise<void> {
    await this.redis.del(this.key(phone), this.lockKey(phone));
  }

  async incrementAttempts(phone: string): Promise<void> {
    const entry = await this.get(phone);
    if (!entry) return;
    const ttl = Math.max(await this.redis.ttl(this.key(phone)), 60);
    await this.redis.setex(this.key(phone), ttl, JSON.stringify({ ...entry, attempts: entry.attempts + 1 }));
  }

  async getAllPhones(): Promise<string[]> {
    // SCAN (cursor, no bloqueante) en vez de KEYS: este Redis es compartido con
    // sesiones, rate-limit, dedup y debounce; un KEYS O(N) cada 2 min congela el
    // event-loop de Redis y genera picos de latencia para TODAS esas operaciones.
    const phones = new Set<string>();
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', SCAN_COUNT);
      cursor = next;
      for (const k of keys) phones.add(k.replace(KEY_PREFIX, ''));
    } while (cursor !== '0');
    return [...phones];
  }
}
