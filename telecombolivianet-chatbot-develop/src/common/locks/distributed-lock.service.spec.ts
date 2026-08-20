import { ConflictException } from '@nestjs/common';
import { DistributedLockService } from './distributed-lock.service';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function buildRedisMock() {
  const store = new Map<string, string>();

  return {
    set: jest.fn(async (key: string, val: string, _px: string, _ttl: number, nx: string) => {
      if (nx === 'NX' && store.has(key)) return null;
      store.set(key, val);
      return 'OK';
    }),
    eval: jest.fn(async (_script: string, _numKeys: number, key: string, token: string) => {
      if (store.get(key) === token) {
        store.delete(key);
        return 1;
      }
      return 0;
    }),
    _store: store,
  } as unknown as import('ioredis').default;
}

it('withLock: second call waits until first is complete', async () => {
  const redis   = buildRedisMock();
  const service = new (DistributedLockService as any)(redis);

  const results: number[] = [];

  const fn = async (val: number) => {
    await service.withLock('test-key', async () => {
      await sleep(30);
      results.push(val);
    });
  };

  const p1 = fn(1);
  const p2 = fn(2).catch((e) => {
    expect(e).toBeInstanceOf(ConflictException);
    results.push(-1);
  });

  await Promise.all([p1, p2]);
  expect(results).toContain(1);
  expect(results).toContain(-1);
});

it('withLock: releases lock if inner function throws', async () => {
  const redis   = buildRedisMock();
  const service = new (DistributedLockService as any)(redis);

  await expect(
    service.withLock('test-key', async () => { throw new Error('handler failed'); }),
  ).rejects.toThrow('handler failed');

  await expect(
    service.withLock('test-key', async () => 'ok'),
  ).resolves.toBe('ok');
});
