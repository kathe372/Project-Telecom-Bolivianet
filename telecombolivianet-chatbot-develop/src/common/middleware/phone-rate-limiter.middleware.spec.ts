import { PhoneRateLimiterMiddleware } from './phone-rate-limiter.middleware';


let mockRedisInstance: any;
let mockPipeline: any;

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockRedisInstance),
}));

const makeConfig = (maxReq = 20, windowSec = 60) => ({
  get: jest.fn((key: string) => {
    if (key === 'rateLimit.maxRequests')   return maxReq;
    if (key === 'rateLimit.windowSeconds') return windowSec;
    return undefined;
  }),
});

const makeWhatsapp = () => ({ sendText: jest.fn().mockResolvedValue(undefined) });

const makeReq = (phone?: string) => ({
  body: phone
    ? { entry: [{ changes: [{ value: { messages: [{ from: phone }] } }] }] }
    : {},
} as any);

const makeRes = () => {
  const res: any = {};
  res.status  = jest.fn().mockReturnValue(res);
  res.set     = jest.fn().mockReturnValue(res);
  res.json    = jest.fn().mockReturnValue(res);
  return res;
};

describe('PhoneRateLimiterMiddleware', () => {
  let middleware: PhoneRateLimiterMiddleware;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPipeline = {
      incr: jest.fn().mockReturnThis(),
      ttl:  jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 1], [null, -1]]),
    };
    mockRedisInstance = {
      on:       jest.fn(),
      pipeline: jest.fn().mockReturnValue(mockPipeline),
      expire:   jest.fn().mockResolvedValue(1),
      set:      jest.fn().mockResolvedValue('OK'),
    };

    middleware = new PhoneRateLimiterMiddleware(makeConfig() as any, makeWhatsapp() as any);
  });


  it('permite la primera solicitud (count=1 ≤ maxRequests=20)', async () => {
    mockPipeline.exec.mockResolvedValue([[null, 1], [null, -1]]);
    const allowed = await middleware.checkLimit('59171000001');
    expect(allowed).toBe(true);
  });

  it('permite la solicitud 20 (en el límite exacto)', async () => {
    mockPipeline.exec.mockResolvedValue([[null, 20], [null, 30]]);
    const allowed = await middleware.checkLimit('59171000001');
    expect(allowed).toBe(true);
  });

  it('bloquea la solicitud 21 (supera maxRequests=20)', async () => {
    mockPipeline.exec.mockResolvedValue([[null, 21], [null, 30]]);
    const allowed = await middleware.checkLimit('59171000001');
    expect(allowed).toBe(false);
  });

  it('configura TTL cuando la clave acaba de crearse (ttl=-1)', async () => {
    mockPipeline.exec.mockResolvedValue([[null, 1], [null, -1]]);
    await middleware.checkLimit('59171000001');
    expect(mockRedisInstance.expire).toHaveBeenCalledWith('rl:59171000001', 60);
  });

  it('no establece TTL si la clave ya tiene expiración (ttl>0)', async () => {
    mockPipeline.exec.mockResolvedValue([[null, 5], [null, 45]]);
    await middleware.checkLimit('59171000001');
    expect(mockRedisInstance.expire).not.toHaveBeenCalled();
  });

  it('usa la clave con prefijo "rl:" por número de teléfono', async () => {
    await middleware.checkLimit('59172000002');
    expect(mockPipeline.incr).toHaveBeenCalledWith('rl:59172000002');
  });

  it('números distintos tienen contadores independientes', async () => {
    await middleware.checkLimit('59171000001');
    await middleware.checkLimit('59172000002');

    expect(mockPipeline.incr).toHaveBeenNthCalledWith(1, 'rl:59171000001');
    expect(mockPipeline.incr).toHaveBeenNthCalledWith(2, 'rl:59172000002');
  });


  it('llama a next() si la solicitud está dentro del límite', async () => {
    jest.spyOn(middleware, 'checkLimit').mockResolvedValue(true);
    const next = jest.fn();
    await middleware.use(makeReq('59171000001'), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('responde 429 si se supera el límite', async () => {
    jest.spyOn(middleware, 'checkLimit').mockResolvedValue(false);
    const res = makeRes();
    const next = jest.fn();
    await middleware.use(makeReq('59171000001'), res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  it('responde 429 con header Retry-After', async () => {
    jest.spyOn(middleware, 'checkLimit').mockResolvedValue(false);
    const res = makeRes();
    await middleware.use(makeReq('59171000001'), res, jest.fn());

    expect(res.set).toHaveBeenCalledWith('Retry-After', '60');
  });

  it('llama a next() si el cuerpo no tiene teléfono (ej. status update)', async () => {
    const next = jest.fn();
    await middleware.use(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });


  it('responde 503 si Redis lanza error (fail-closed)', async () => {
    jest.spyOn(middleware, 'checkLimit').mockRejectedValue(new Error('ECONNREFUSED'));
    const res = makeRes();
    const next = jest.fn();

    await middleware.use(makeReq('59171000001'), res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });


  it('registra listener de error en Redis al construirse', () => {
    expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
