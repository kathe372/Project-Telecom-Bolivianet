import { ConfigService } from '@nestjs/config';
import { OutboxRepositoryService } from './outbox-repository.service';


const store = new Map<string, string>();

function applyImpl() {
  redisMock.get.mockImplementation((key: string) =>
    Promise.resolve(store.get(key) ?? null));
  redisMock.setex.mockImplementation((key: string, _ttl: number, value: string) => {
    store.set(key, value);
    return Promise.resolve('OK');
  });
  redisMock.del.mockImplementation((...keys: string[]) => {
    let n = 0;
    for (const k of keys) { if (store.delete(k)) n++; }
    return Promise.resolve(n);
  });
  // SET con semántica NX (para el lock atómico de markAsProcessing)
  redisMock.set.mockImplementation((key: string, val: string, ...args: string[]) => {
    const nx = args.includes('NX');
    if (nx && store.has(key)) return Promise.resolve(null);
    store.set(key, val);
    return Promise.resolve('OK');
  });
  redisMock.ttl.mockImplementation(() => Promise.resolve(1800));
  redisMock.keys.mockImplementation((pattern: string) => {
    const prefix = pattern.replace('*', '');
    const matches = [...store.keys()].filter(k => k.startsWith(prefix));
    return Promise.resolve(matches);
  });
  // SCAN mock: devuelve todo en una sola página (cursor '0')
  redisMock.scan.mockImplementation((_cursor: string, _match: string, pattern: string) => {
    const prefix = pattern.replace('*', '');
    const matches = [...store.keys()].filter(k => k.startsWith(prefix));
    return Promise.resolve(['0', matches]);
  });
  redisMock.on.mockImplementation(() => redisMock);
  redisMock.disconnect.mockImplementation(() => undefined);
}

const redisMock = {
  get:        jest.fn(),
  set:        jest.fn(),
  setex:      jest.fn(),
  del:        jest.fn(),
  ttl:        jest.fn(),
  keys:       jest.fn(),
  scan:       jest.fn(),
  on:         jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => redisMock),
}));

applyImpl();

function makeSvc(): OutboxRepositoryService {
  const config = {
    get: jest.fn((key: string) => {
      const cfg: Record<string, any> = {
        'redis.host': 'localhost', 'redis.port': 6379,
        'redis.password': '', 'redis.db': 0,
      };
      return cfg[key] ?? null;
    }),
  } as unknown as ConfigService;
  const svc = new OutboxRepositoryService(config);
  svc.onModuleInit();
  return svc;
}

describe('OutboxRepositoryService', () => {
  let svc: OutboxRepositoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    store.clear();
    applyImpl();
    svc = makeSvc();
  });

  afterEach(() => svc.onModuleDestroy());

  it('OR-01 — push() guarda la entrada con attempts=0', async () => {
    await svc.push('591700000001', 'Hola mundo');
    const entry = await svc.get('591700000001');
    expect(entry).not.toBeNull();
    expect(entry!.text).toBe('Hola mundo');
    expect(entry!.attempts).toBe(0);
  });

  it('OR-01b — push() NO sobrescribe: combina mensajes para no perder ninguno', async () => {
    await svc.push('591700000001', 'Primer mensaje');
    await svc.push('591700000001', 'Segundo mensaje');
    const entry = await svc.get('591700000001');
    expect(entry!.text).toContain('Primer mensaje');
    expect(entry!.text).toContain('Segundo mensaje');
  });

  it('OR-02 — get() retorna null para número sin outbox', async () => {
    const entry = await svc.get('591799999999');
    expect(entry).toBeNull();
  });

  it('OR-03 — remove() borra la entrada del outbox', async () => {
    await svc.push('591700000001', 'mensaje');
    await svc.remove('591700000001');
    expect(await svc.get('591700000001')).toBeNull();
  });

  it('OR-04 — markAsProcessing() retorna true primera vez', async () => {
    await svc.push('591700000001', 'mensaje');
    const acquired = await svc.markAsProcessing('591700000001');
    expect(acquired).toBe(true);
  });

  it('OR-04b — R2: markAsProcessing adquiere el lock SIN mirar la entrada (lock-first)', async () => {
    // Contrato nuevo: el lock se toma antes de leer la entrada; el llamador
    // lee la entrada dentro del lock. Sin entrada previa, igual adquiere.
    expect(await svc.markAsProcessing('591700000099')).toBe(true);
    expect(await svc.markAsProcessing('591700000099')).toBe(false);
  });

  it('OR-05 — R2: lock atómico — el 2º markAsProcessing() NO adquiere (evita doble envío)', async () => {
    await svc.push('591700000001', 'mensaje');
    const first  = await svc.markAsProcessing('591700000001');
    const second = await svc.markAsProcessing('591700000001');
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('OR-06 — revertToPending() libera el lock y permite re-adquirir', async () => {
    await svc.push('591700000001', 'mensaje');
    await svc.markAsProcessing('591700000001');
    await svc.revertToPending('591700000001');
    const reacquired = await svc.markAsProcessing('591700000001');
    expect(reacquired).toBe(true);
  });

  it('OR-06b — remove() borra la entrada Y libera el lock', async () => {
    await svc.push('591700000001', 'mensaje');
    await svc.markAsProcessing('591700000001');
    await svc.remove('591700000001');
    // sin entrada, no hay nada que procesar; y el lock quedó libre
    expect(await svc.get('591700000001')).toBeNull();
    await svc.push('591700000001', 'otro');
    expect(await svc.markAsProcessing('591700000001')).toBe(true);
  });

  it('OR-07 — incrementAttempts() incrementa el contador', async () => {
    await svc.push('591700000001', 'mensaje');
    await svc.incrementAttempts('591700000001');
    const entry = await svc.get('591700000001');
    expect(entry!.attempts).toBe(1);
  });

  it('OR-08 — getAllPhones() retorna los números con outbox pendiente', async () => {
    await svc.push('591700000001', 'a');
    await svc.push('591700000002', 'b');
    const phones = await svc.getAllPhones();
    expect(phones).toContain('591700000001');
    expect(phones).toContain('591700000002');
  });

  it('OR-09 — getAllPhones() retorna array vacío cuando no hay mensajes pendientes', async () => {
    const phones = await svc.getAllPhones();
    expect(phones).toHaveLength(0);
  });

  it('OR-10 — get() retorna null y limpia entrada corrupta', async () => {
    store.set('wa:outbox:591700000001', 'NOT_VALID_JSON{{{');
    const entry = await svc.get('591700000001');
    expect(entry).toBeNull();
    expect(store.has('wa:outbox:591700000001')).toBe(false);
  });
});
