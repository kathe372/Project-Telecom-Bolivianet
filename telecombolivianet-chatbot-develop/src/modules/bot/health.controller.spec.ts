import { HealthController } from './health.controller';
import { HealthService, HealthStatus } from './health.service';


const ALL_OK: HealthStatus = {
  status:   'ok',
  redis:    'connected',
  postgres: 'connected',
  backend:  'reachable',
  uptime:   42,
};

const makeController = (checkResult: HealthStatus): HealthController => {
  const svc = { check: jest.fn().mockResolvedValue(checkResult) } as unknown as HealthService;
  return new HealthController(svc);
};

describe('HealthController', () => {
  it('retorna status "ok" cuando todos los servicios están disponibles', async () => {
    const ctrl = makeController(ALL_OK);
    const result = await ctrl.check();

    expect(result.status).toBe('ok');
    expect(result.redis).toBe('connected');
    expect(result.postgres).toBe('connected');
    expect(result.backend).toBe('reachable');
  });

  it('retorna status "degraded" cuando Redis no responde', async () => {
    const ctrl = makeController({ ...ALL_OK, status: 'degraded', redis: 'error' });
    const result = await ctrl.check();

    expect(result.status).toBe('degraded');
    expect(result.redis).toBe('error');
  });

  it('retorna status "degraded" cuando PostgreSQL no responde', async () => {
    const ctrl = makeController({ ...ALL_OK, status: 'degraded', postgres: 'error' });
    const result = await ctrl.check();

    expect(result.status).toBe('degraded');
    expect(result.postgres).toBe('error');
  });

  it('retorna status "degraded" cuando el backend no es alcanzable', async () => {
    const ctrl = makeController({ ...ALL_OK, status: 'degraded', backend: 'unreachable' });
    const result = await ctrl.check();

    expect(result.status).toBe('degraded');
    expect(result.backend).toBe('unreachable');
  });

  it('campo uptime es un número positivo', async () => {
    const ctrl = makeController(ALL_OK);
    const result = await ctrl.check();

    expect(typeof result.uptime).toBe('number');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });
});


let mockRedisInstance: any;

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockRedisInstance),
}));

const makeConfig = (backendUrl = '') => ({
  get: jest.fn((key: string) => {
    if (key === 'sistema.apiUrl') return backendUrl;
    if (key === 'redis.host')    return 'localhost';
    if (key === 'redis.port')    return 6379;
    return undefined;
  }),
});

const makeDataSource = (fail = false) => ({
  query: fail
    ? jest.fn().mockRejectedValue(new Error('connection refused'))
    : jest.fn().mockResolvedValue([{ '?column?': 1 }]),
});

describe('HealthService.check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisInstance = {
      on:         jest.fn(),
      ping:       jest.fn().mockResolvedValue('PONG'),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('redis="connected" cuando ping responde PONG', async () => {
    const { HealthService: Svc } = require('./health.service');
    const svc = new Svc(makeConfig(), makeDataSource());
    const result = await svc.check();

    expect(result.redis).toBe('connected');
  });

  it('redis="error" cuando ping lanza excepción', async () => {
    mockRedisInstance.ping.mockRejectedValue(new Error('ECONNREFUSED'));
    const { HealthService: Svc } = require('./health.service');
    const svc = new Svc(makeConfig(), makeDataSource());
    const result = await svc.check();

    expect(result.redis).toBe('error');
  });

  it('postgres="connected" cuando SELECT 1 tiene éxito', async () => {
    const { HealthService: Svc } = require('./health.service');
    const svc = new Svc(makeConfig(), makeDataSource(false));
    const result = await svc.check();

    expect(result.postgres).toBe('connected');
  });

  it('postgres="error" cuando dataSource.query lanza', async () => {
    const { HealthService: Svc } = require('./health.service');
    const svc = new Svc(makeConfig(), makeDataSource(true));
    const result = await svc.check();

    expect(result.postgres).toBe('error');
  });

  it('backend="not-configured" cuando SISTEMA_API_URL está vacío', async () => {
    const { HealthService: Svc } = require('./health.service');
    const svc = new Svc(makeConfig(''), makeDataSource());
    const result = await svc.check();

    expect(result.backend).toBe('not-configured');
  });

  it('status="ok" cuando todos los checks pasan', async () => {
    const { HealthService: Svc } = require('./health.service');
    const svc = new Svc(makeConfig(), makeDataSource());
    jest.spyOn(svc, 'check').mockResolvedValue({
      status: 'ok', redis: 'connected', postgres: 'connected',
      backend: 'reachable', uptime: 1,
    });
    const result = await svc.check();

    expect(result.status).toBe('ok');
  });

  it('uptime es un entero mayor o igual a 0', async () => {
    const { HealthService: Svc } = require('./health.service');
    const svc = new Svc(makeConfig(), makeDataSource());
    const result = await svc.check();

    expect(Number.isInteger(result.uptime)).toBe(true);
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });
});
