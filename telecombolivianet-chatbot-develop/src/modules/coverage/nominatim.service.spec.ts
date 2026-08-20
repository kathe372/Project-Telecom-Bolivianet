import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NominatimService } from './nominatim.service';

// ─── Mock ioredis ─────────────────────────────────────────────
const mockRedis = {
  get:        jest.fn(),
  setex:      jest.fn(),
  set:        jest.fn(),
  on:         jest.fn(),
  disconnect: jest.fn(),
};
// ts-jest with esModuleInterop resolves `import Redis from 'ioredis'` → .default
jest.mock('ioredis', () => {
  const ctor = jest.fn().mockImplementation(() => mockRedis);
  return { default: ctor };
});

// ─── Mock axios ───────────────────────────────────────────────
const mockAxiosGet = jest.fn();
// ts-jest resolves `import axios from 'axios'` → .default
jest.mock('axios', () => ({
  default: { get: (...args: any[]) => mockAxiosGet(...args) },
}));

// ─── Helpers ──────────────────────────────────────────────────
const CONFIG: Record<string, any> = {
  'redis.host': 'localhost', 'redis.port': 6379,
  'redis.password': '',      'redis.db':   0,
};

const nomResult = (lat: string, lon: string, bbox: string[]) => ({
  data: [{ lat, lon, boundingbox: bbox }],
});

describe('NominatimService', () => {
  let service: NominatimService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: cache miss, rate-limit slot available, geocode success
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.set.mockResolvedValue('OK');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NominatimService,
        { provide: ConfigService, useValue: { get: (k: string) => CONFIG[k] } },
      ],
    }).compile();

    service = module.get<NominatimService>(NominatimService);
    service.onModuleInit();
  });

  it('TC-NOM01 — retorna coords para dirección válida', async () => {
    mockAxiosGet.mockResolvedValue(
      nomResult('-17.389', '-66.156', ['-17.4', '-17.3', '-66.2', '-66.1']),
    );
    const result = await service.geocode('Av. América 123');
    expect(result).toEqual({ lat: -17.389, lng: -66.156 });
  });

  it('TC-NOM02 — retorna null para dirección vacía (sin llamar a Nominatim)', async () => {
    const result = await service.geocode('');
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('TC-NOM03 — retorna null cuando Nominatim no devuelve resultados', async () => {
    mockAxiosGet.mockResolvedValue({ data: [] });
    const result = await service.geocode('Lugar inexistente xyz');
    expect(result).toBeNull();
  });

  it('TC-NOM04 — usa caché Redis cuando el valor ya existe', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ lat: -17.389, lng: -66.156 }));
    const result = await service.geocode('Av. América 123');
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(result).toEqual({ lat: -17.389, lng: -66.156 });
  });

  it('TC-NOM05 — agrega ", Bolivia" a la consulta enviada a Nominatim', async () => {
    mockAxiosGet.mockResolvedValue(
      nomResult('-17.389', '-66.156', ['-17.4', '-17.3', '-66.2', '-66.1']),
    );
    await service.geocode('Zona Norte');
    const params = mockAxiosGet.mock.calls[0][1].params;
    expect(params.q).toBe('Zona Norte, Bolivia');
  });

  it('TC-NOM06 — retorna null cuando el bbox supera 0.5°', async () => {
    mockAxiosGet.mockResolvedValue(
      nomResult('-17.5', '-66.2', ['-18.0', '-17.0', '-67.0', '-66.0']),
    );
    const result = await service.geocode('Bolivia');
    expect(result).toBeNull();
  });

  it('TC-NOM07 — retorna null cuando Redis bloquea rate-limit', async () => {
    mockRedis.set.mockResolvedValue(null); // lock not acquired
    const result = await service.geocode('Calle Lanza');
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
