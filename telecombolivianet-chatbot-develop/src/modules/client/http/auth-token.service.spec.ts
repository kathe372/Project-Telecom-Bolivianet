import axios from 'axios';
import { AuthTokenService } from './auth-token.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const CFG: Record<string, unknown> = {
  'sistema.jwtRefreshMarginMinutes': 60,
  'sistema.botEmail': 'bot@telecombolivianet.bo',
  'sistema.botPassword': 'secret',
  'sistema.apiUrl': 'http://backend:5000',
};

const retryPolicyMock = { execute: jest.fn((fn: () => Promise<unknown>) => fn()) };

function makeSvc(): AuthTokenService {
  const config = { get: jest.fn((k: string) => CFG[k]) } as any;
  return new AuthTokenService(config, retryPolicyMock as any);
}

describe('AuthTokenService', () => {
  let svc: AuthTokenService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: { data: { Token: 'jwt-123' } } } as any);
    svc = makeSvc();
  });

  describe('login() — parseo del token en distintas formas de respuesta', () => {
    it('toma data.data.Token', async () => {
      mockedAxios.post.mockResolvedValue({ data: { data: { Token: 'A' } } } as any);
      await svc.ensureToken();
      expect(svc.getCurrentToken()).toBe('A');
    });

    it('toma data.data.token (minúscula) como fallback', async () => {
      mockedAxios.post.mockResolvedValue({ data: { data: { token: 'B' } } } as any);
      await svc.ensureToken();
      expect(svc.getCurrentToken()).toBe('B');
    });

    it('toma data.token como último fallback', async () => {
      mockedAxios.post.mockResolvedValue({ data: { token: 'C' } } as any);
      await svc.ensureToken();
      expect(svc.getCurrentToken()).toBe('C');
    });

    it('hace login contra /api/auth/login con las credenciales', async () => {
      await svc.ensureToken();
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://backend:5000/api/auth/login',
        { Email: 'bot@telecombolivianet.bo', Password: 'secret' },
      );
    });
  });

  describe('ensureToken() — política de refresh', () => {
    it('hace login cuando no hay token', async () => {
      await svc.ensureToken();
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('NO re-loguea si el token está fresco (fuera del margen)', async () => {
      await svc.ensureToken();                 // login #1, expira en 8h
      mockedAxios.post.mockClear();
      await svc.ensureToken();                 // fresco → sin login
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('re-loguea si el token está dentro del margen de refresh (<60 min)', async () => {
      await svc.ensureToken();
      (svc as any).tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min < margen 60
      mockedAxios.post.mockClear();
      await svc.ensureToken();
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('re-loguea si el token ya expiró', async () => {
      await svc.ensureToken();
      (svc as any).tokenExpiresAt = new Date(Date.now() - 1000); // vencido
      mockedAxios.post.mockClear();
      await svc.ensureToken();
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });

  it('getCurrentToken() devuelve null antes de autenticar', () => {
    expect(svc.getCurrentToken()).toBeNull();
  });
});

// ── P1.2 (auditoría 2026-08): mismo interceptor de reintento transitorio que sistema-api.service.ts ──
describe('AuthTokenService — onModuleInit() interceptor de reintento transitorio', () => {
  let svc: AuthTokenService;
  let mockRequest: jest.Mock;
  let mockHttpInstance: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    retryPolicyMock.execute.mockImplementation((fn: () => Promise<unknown>) => fn());
    mockedAxios.post.mockResolvedValue({ data: { data: { Token: 'jwt-123' } } } as any);

    mockRequest = jest.fn();
    mockHttpInstance = {
      get: jest.fn(), post: jest.fn(), patch: jest.fn(),
      request: mockRequest,
      interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    };
    (mockedAxios.create as jest.Mock).mockReturnValue(mockHttpInstance);

    svc = makeSvc();
    await svc.onModuleInit();
  });

  const transientRejected = () => mockHttpInstance.interceptors.response.use.mock.calls[1][1];

  it('registra el interceptor de reintento transitorio además del de 401', () => {
    expect(mockHttpInstance.interceptors.response.use).toHaveBeenCalledTimes(2);
  });

  it('reintenta un 503 usando IRetryPolicy con label "auth-token-service"', async () => {
    mockRequest.mockResolvedValueOnce({ data: { ok: true } });
    const err = { response: { status: 503 }, config: {} };

    await transientRejected()(err);

    expect(retryPolicyMock.execute).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ label: 'auth-token-service' }),
    );
  });

  it('no reintenta dos veces el mismo request', async () => {
    const err: any = { response: { status: 503 }, config: {} };
    mockRequest.mockResolvedValue({ data: { ok: true } });

    await transientRejected()(err);
    await expect(transientRejected()(err)).rejects.toBe(err);

    expect(retryPolicyMock.execute).toHaveBeenCalledTimes(1);
  });
});
