import { Injectable, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

@Injectable()
export class DistributedLockService {
  private readonly TTL_MS = 30_000;

  private static readonly LUA_RELEASE = `
    if redis.call('get', KEYS[1]) == ARGV[1] then
      return redis.call('del', KEYS[1])
    else
      return 0
    end
  `;

  constructor(private readonly redis: Redis) {}

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = `lock:${key}`;
    const token   = randomUUID();

    const acquired = await this.redis.set(lockKey, token, 'PX', this.TTL_MS, 'NX');
    if (!acquired) {
      throw new ConflictException(`Mensaje en procesamiento para ${key}`);
    }

    try {
      return await fn();
    } finally {
      await this.redis.eval(
        DistributedLockService.LUA_RELEASE,
        1,
        lockKey,
        token,
      );
    }
  }
}
