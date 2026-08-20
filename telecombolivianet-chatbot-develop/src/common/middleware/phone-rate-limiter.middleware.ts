import {
  Injectable,
  NestMiddleware,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { WhatsappApiService } from '../../modules/whatsapp/whatsapp-api.service';


export interface RateLimitConfig {
  windowSeconds: number;
  maxRequests: number;
}

@Injectable()
export class PhoneRateLimiterMiddleware implements NestMiddleware {
  private readonly logger = new Logger(PhoneRateLimiterMiddleware.name);
  private redis: Redis;
  private readonly config: RateLimitConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly whatsapp: WhatsappApiService,
  ) {
    this.config = {
      windowSeconds: configService.get<number>('rateLimit.windowSeconds') ?? 60,
      maxRequests:   configService.get<number>('rateLimit.maxRequests')   ?? 20,
    };

    this.redis = new Redis({
      host:         configService.get<string>('redis.host'),
      port:         configService.get<number>('redis.port'),
      password:     configService.get<string>('redis.password') || undefined,
      db:           configService.get<number>('redis.db'),
      retryStrategy: (times) => Math.min(times * 200, 5000),
      lazyConnect:  true,
    });

    this.redis.on('error', (err: Error) =>
      this.logger.warn(`Redis rate-limiter error: ${err.message}`),
    );
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const phone = this.extractPhone(req.body);

    if (!phone) {
      next();
      return;
    }

    try {
      const allowed = await this.checkLimit(phone);

      if (!allowed) {
        this.logger.warn(`Rate limit excedido para ${phone}`);
        await this.sendRateLimitNotification(phone);
        res
          .status(HttpStatus.TOO_MANY_REQUESTS)
          .set('Retry-After', String(this.config.windowSeconds))
          .json({
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Demasiados mensajes. Por favor espera un momento.',
          });
        return;
      }
    } catch (err: unknown) {
      this.logger.error(`Rate limiter Redis failure — rechazando request: ${(err as Error).message}`);
      res
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .json({
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Servicio temporalmente no disponible. Intenta en unos momentos.',
        });
      return;
    }

    next();
  }

  async checkLimit(phone: string): Promise<boolean> {
    const key = `rl:${phone}`;

    const pipeline = this.redis.pipeline();
    pipeline.incr(key);
    pipeline.ttl(key);

    const results = await pipeline.exec();

    const incrErr = results?.[0]?.[0];
    const count   = results?.[0]?.[1];
    const ttl     = results?.[1]?.[1] as number;

    // Si el INCR falló, `count` sería null y `null <= max` es true → el limiter
    // dejaría pasar TODO en silencio. Propagar el error para que el middleware
    // aplique su política fail-closed (503) en vez de anular la protección.
    if (incrErr || typeof count !== 'number') {
      throw incrErr instanceof Error ? incrErr : new Error('Rate limiter: respuesta de pipeline inválida');
    }

    if (ttl < 0) {
      await this.redis.expire(key, this.config.windowSeconds);
    }

    return count <= this.config.maxRequests;
  }

  private async sendRateLimitNotification(phone: string): Promise<void> {
    const notifiedKey = `rl:notified:${phone}`;
    try {
      const alreadyNotified = await this.redis.set(
        notifiedKey, '1', 'EX', this.config.windowSeconds, 'NX',
      );
      if (alreadyNotified !== 'OK') return;

      await this.whatsapp.sendText(
        phone,
        '⏳ Estás enviando muchos mensajes seguidos. ' +
        'Por favor espera un momento antes de continuar.',
      );
    } catch (err: unknown) {
      this.logger.warn(`No se pudo enviar notif. rate limit a ${phone}: ${(err as Error).message}`);
    }
  }

  private extractPhone(body: unknown): string | null {
    try {
      const b = body as any;
      return (
        b?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from ?? null
      );
    } catch {
      return null;
    }
  }
}
