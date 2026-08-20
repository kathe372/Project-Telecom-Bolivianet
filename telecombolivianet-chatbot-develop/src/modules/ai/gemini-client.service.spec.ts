import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiClientService } from './gemini-client.service';


function makeConfig(serviceAccountJson = '', location?: string): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'gemini.serviceAccountJson') return serviceAccountJson;
      if (key === 'gemini.location') return location;
      return undefined;
    }),
  } as any;
}

const FAKE_SERVICE_ACCOUNT = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'key-id',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4PAtEsHAIJqFiAXwxYuUHX+CJ4F\nfakekey\n-----END RSA PRIVATE KEY-----\n',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  client_id: '12345',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
});

describe('GeminiClientService — API key mode', () => {
  let service: GeminiClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiClientService,
        { provide: ConfigService, useValue: makeConfig('') },
      ],
    }).compile();

    service = module.get<GeminiClientService>(GeminiClientService);
    await service.onModuleInit();
  });

  it('isUsingOAuth() returns false when no service account configured', () => {
    expect(service.isUsingOAuth()).toBe(false);
  });

  it('getAccessToken() returns null in API key mode', async () => {
    const token = await service.getAccessToken();
    expect(token).toBeNull();
  });

  it('getAuthHeaders() returns empty object in API key mode', async () => {
    const headers = await service.getAuthHeaders();
    expect(headers).toEqual({});
  });

  it('buildUrl() appends ?key= in API key mode', () => {
    const url = service.buildUrl(
      'https://generativelanguage.googleapis.com/v1beta/models',
      'gemini-2.0-flash',
      'generateContent',
      'my-api-key',
    );
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=my-api-key',
    );
  });

  it('buildUrl() for embedContent appends ?key= in API key mode', () => {
    const url = service.buildUrl(
      'https://generativelanguage.googleapis.com/v1beta/models',
      'text-embedding-004',
      'embedContent',
      'my-api-key',
    );
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=my-api-key',
    );
  });
});

describe('GeminiClientService — OAuth2 mode', () => {
  let service: GeminiClientService;
  let mockGetClient: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiClientService,
        { provide: ConfigService, useValue: makeConfig(FAKE_SERVICE_ACCOUNT) },
      ],
    }).compile();

    service = module.get<GeminiClientService>(GeminiClientService);

    mockGetClient = jest.fn().mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: 'fake-bearer-token-xyz' }),
    });

    await service.onModuleInit();
    (service as any).auth = { getClient: mockGetClient };
  });

  it('isUsingOAuth() returns true when service account is configured', () => {
    expect(service.isUsingOAuth()).toBe(true);
  });

  it('getAccessToken() returns a bearer token', async () => {
    const token = await service.getAccessToken();
    expect(token).toBe('fake-bearer-token-xyz');
  });

  it('getAuthHeaders() returns Authorization: Bearer header', async () => {
    const headers = await service.getAuthHeaders();
    expect(headers).toEqual({ Authorization: 'Bearer fake-bearer-token-xyz' });
  });

  it('buildUrl() does NOT append ?key= in OAuth2 mode', () => {
    const url = service.buildUrl(
      'https://generativelanguage.googleapis.com/v1beta/models',
      'gemini-2.0-flash',
      'generateContent',
      'my-api-key',
    );
    expect(url).toContain('aiplatform.googleapis.com');
    expect(url).toContain('test-project');
    expect(url).toContain('gemini-2.0-flash:generateContent');
    expect(url).not.toContain('?key=');
  });

  // P0.1 (auditoría 2026-08): endpoint global — sin GEMINI_LOCATION configurado,
  // usa el pool multi-región en vez de pelear por la capacidad de una sola región.
  it('buildUrl() usa el endpoint GLOBAL (sin prefijo de región en el host) cuando no hay GEMINI_LOCATION', () => {
    const url = service.buildUrl(
      'https://generativelanguage.googleapis.com/v1beta/models',
      'gemini-2.5-flash',
      'generateContent',
      'my-api-key',
    );
    expect(url).toBe(
      'https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/google/models/gemini-2.5-flash:generateContent',
    );
  });
});

describe('GeminiClientService — región explícita (GEMINI_LOCATION configurado)', () => {
  it('buildUrl() vuelve al endpoint regional clásico si GEMINI_LOCATION está seteado', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiClientService,
        { provide: ConfigService, useValue: makeConfig(FAKE_SERVICE_ACCOUNT, 'us-central1') },
      ],
    }).compile();

    const service = module.get<GeminiClientService>(GeminiClientService);
    await service.onModuleInit();

    const url = service.buildUrl(
      'https://generativelanguage.googleapis.com/v1beta/models',
      'gemini-2.5-flash',
      'generateContent',
      'my-api-key',
    );
    expect(url).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent',
    );
  });
});

describe('GeminiClientService — token caching', () => {
  let service: GeminiClientService;
  let mockGetAccessToken: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiClientService,
        { provide: ConfigService, useValue: makeConfig(FAKE_SERVICE_ACCOUNT) },
      ],
    }).compile();

    service = module.get<GeminiClientService>(GeminiClientService);
    mockGetAccessToken = jest.fn().mockResolvedValue({ token: 'cached-token' });

    await service.onModuleInit();
    (service as any).auth = {
      getClient: jest.fn().mockResolvedValue({ getAccessToken: mockGetAccessToken }),
    };
  });

  it('calls getAccessToken only once when token is still valid', async () => {
    await service.getAccessToken();
    await service.getAccessToken();
    await service.getAccessToken();
    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes token when cache has expired', async () => {
    (service as any).tokenExpiresAt = Date.now() - 1000;
    (service as any).cachedToken = 'old-token';

    await service.getAccessToken();
    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
  });
});

describe('GeminiClientService — invalid service account JSON', () => {
  it('falls back to API key mode when JSON is malformed', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiClientService,
        { provide: ConfigService, useValue: makeConfig('not-valid-json{{{') },
      ],
    }).compile();

    const service = module.get<GeminiClientService>(GeminiClientService);
    await service.onModuleInit();

    expect(service.isUsingOAuth()).toBe(false);
    const headers = await service.getAuthHeaders();
    expect(headers).toEqual({});
  });
});
