import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import axios from 'axios';

export interface HealthStatus {
  status:   'ok' | 'degraded';
  redis:    string;
  postgres: string;
  backend:  string;
  uptime:   number;
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly backendUrl: string;
  private readonly startedAt = Date.now();

  constructor(
    config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    this.backendUrl = config.get<string>('sistema.apiUrl') ?? '';

    this.redis = new Redis({
      host:        config.get<string>('redis.host'),
      port:        config.get<number>('redis.port'),
      password:    config.get<string>('redis.password') || undefined,
      db:          config.get<number>('redis.db'),
      lazyConnect: true,
    });
    this.redis.on('error', () => {});
  }

  async onModuleDestroy(): Promise<void> {
    try { await this.redis.disconnect(); } catch {}
  }

  async check(): Promise<HealthStatus> {
    const [redis, postgres, backend] = await Promise.all([
      this.checkRedis(),
      this.checkPostgres(),
      this.checkBackend(),
    ]);

    const allOk = redis === 'connected' && postgres === 'connected' && backend === 'reachable';

    return {
      status:   allOk ? 'ok' : 'degraded',
      redis,
      postgres,
      backend,
      uptime:   Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  private async checkRedis(): Promise<string> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'connected' : 'error';
    } catch {
      return 'error';
    }
  }

  private async checkPostgres(): Promise<string> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'connected';
    } catch {
      return 'error';
    }
  }

  private async checkBackend(): Promise<string> {
    if (!this.backendUrl) return 'not-configured';
    try {
      await axios.get(`${this.backendUrl}/health`, { timeout: 3_000 });
      return 'reachable';
    } catch {
      return 'unreachable';
    }
  }
}
