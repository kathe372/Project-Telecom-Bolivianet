import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';


@Injectable()
export class WebhookDedupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDedupService.name);
  private redis: Redis;

  private static readonly PREFIX  = 'webhook_dedup:';
  private static readonly TTL_SEC = 300;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.redis = new Redis({
      host:          this.config.get<string>('redis.host'),
      port:          this.config.get<number>('redis.port'),
      password:      this.config.get<string>('redis.password') || undefined,
      db:            this.config.get<number>('redis.db'),
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
    this.redis.on('error', (err) =>
      this.logger.error('Redis error (dedup)', err.message));
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }

  async isDuplicate(messageId: string): Promise<boolean> {
    const key = `${WebhookDedupService.PREFIX}${messageId}`;
    const result = await this.redis.set(key, '1', 'EX', WebhookDedupService.TTL_SEC, 'NX');
    return result === null;
  }
}
