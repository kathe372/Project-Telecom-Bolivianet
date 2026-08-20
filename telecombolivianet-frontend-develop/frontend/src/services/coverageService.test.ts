import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('./api', () => ({
  default: {
    get:    vi.fn(),
    post:   vi.fn(),
    put:    vi.fn(),
    delete: vi.fn(),
  },
}));

import api from './api';
import { coverageService } from './coverageService';

// El backend responde en PascalCase; el servicio debe mapear a camelCase.
const ZONE = {
  Id: 'zone-001', Nombre: 'Zona Centro', Tecnologia: 'GPON',
  VelocidadMaxMbps: 100, Estado: 'Activa', BoxCount: 3,
};

const BOX = {
  Id: 'box-001', Codigo: 'NAP-001', DireccionReferencia: 'Av. Principal',
  ZoneId: 'zone-001', ZoneName: 'Zona Centro',
  Lat: -17.389, Lng: -66.156,
  PuertosTotal: 8, PuertosOcupados: 4, PuertosReservados: 1, PuertosLibres: 3,
  Estado: 'Activo',
};


describe('coverageService.getZones', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-FE-S01 — llama GET /coverage/zones con includeGeometry=false por defecto', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: [ZONE] } });

    await coverageService.getZones();

    expect(api.get).toHaveBeenCalledWith(
      '/coverage/zones', { params: { includeGeometry: false } });
  });

  it('TC-FE-S01b — pasa includeGeometry=true cuando se solicita', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: [ZONE] } });

    await coverageService.getZones(true);

    expect(api.get).toHaveBeenCalledWith(
      '/coverage/zones', { params: { includeGeometry: true } });
  });
});


describe('coverageService.createZone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-FE-S02 — formatea correctamente el body JSON', async () => {
    (api.post as Mock).mockResolvedValueOnce({ data: { data: ZONE } });

    const payload = {
      nombre: 'Zona Norte', tecnologia: 'GPON', velocidadMaxMbps: 100,
      estado: 'Planificada' as const,
      geoJson: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
    };

    const result = await coverageService.createZone(payload);

    expect(api.post).toHaveBeenCalledWith('/coverage/zones', payload);
    expect(result.id).toBe('zone-001');
  });
});


describe('coverageService.updateBox', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-FE-S03 — hace PUT con el id correcto en la URL', async () => {
    (api.put as Mock).mockResolvedValueOnce({ data: { data: BOX } });

    const payload = {
      codigo: 'NAP-001', direccionReferencia: 'Av. Principal',
      puertosTotal: 8, puertosOcupados: 4, estado: 'Activo' as const,
    };

    await coverageService.updateBox('box-001', payload);

    expect(api.put).toHaveBeenCalledWith('/coverage/boxes/box-001', payload);
  });
});


describe('coverageService — propagación de errores', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-FE-S04a — getZones propaga error 401', async () => {
    (api.get as Mock).mockRejectedValueOnce({
      response: { status: 401, data: { message: 'No autorizado' } },
    });

    await expect(coverageService.getZones()).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  it('TC-FE-S04b — createZone propaga error 422 del servidor', async () => {
    (api.post as Mock).mockRejectedValueOnce({
      response: { status: 422, data: { message: 'Nombre duplicado' } },
    });

    await expect(coverageService.createZone({
      nombre: 'Zona Dup', tecnologia: 'GPON', velocidadMaxMbps: 50,
      estado: 'Activa', geoJson: '{}',
    })).rejects.toMatchObject({ response: { status: 422 } });
  });

  it('TC-FE-S04c — deleteZone propaga error 400 cuando hay cajas activas', async () => {
    (api.delete as Mock).mockRejectedValueOnce({
      response: { status: 400, data: { message: 'cajas distribuidoras activas' } },
    });

    await expect(coverageService.deleteZone('zone-001')).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
});


describe('coverageService.getBoxesByZone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('llama GET /coverage/zones/:zoneId/boxes', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: [BOX] } });

    const result = await coverageService.getBoxesByZone('zone-001');

    expect(api.get).toHaveBeenCalledWith('/coverage/zones/zone-001/boxes');
    expect(result[0].codigo).toBe('NAP-001');
  });
});

// ── PR-4b: puertos NAP ──────────────────────────────────────────────────────
const PORT = {
  Numero: 3, Status: 'Used', AccountId: 'acc-1', OnuSerial: 'HWTC 1234',
  InstallationId: 'ins-1', UpdatedAt: '2026-08-01T10:00:00Z',
};

describe('coverageService.getBoxPorts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('llama GET /coverage/boxes/:id/ports y mapea PascalCase→camelCase', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: [PORT] } });

    const result = await coverageService.getBoxPorts('box-001');

    expect(api.get).toHaveBeenCalledWith('/coverage/boxes/box-001/ports');
    expect(result[0]).toMatchObject({ numero: 3, status: 'Used', onuSerial: 'HWTC 1234', accountId: 'acc-1' });
  });
});

describe('coverageService.damagePort / repairPort', () => {
  beforeEach(() => vi.clearAllMocks());

  it('damagePort llama POST …/ports/:n/damage', async () => {
    (api.post as Mock).mockResolvedValueOnce({});
    await coverageService.damagePort('box-001', 5);
    expect(api.post).toHaveBeenCalledWith('/coverage/boxes/box-001/ports/5/damage');
  });

  it('repairPort llama POST …/ports/:n/repair', async () => {
    (api.post as Mock).mockResolvedValueOnce({});
    await coverageService.repairPort('box-001', 5);
    expect(api.post).toHaveBeenCalledWith('/coverage/boxes/box-001/ports/5/repair');
  });
});

// ── PR-2: reporte de demanda ────────────────────────────────────────────────
const QUERY = {
  Id: 'q1', QueriedAt: '2026-08-01T09:00:00Z', Result: 'NO_COVERAGE', ZoneName: null,
  Channel: 'WhatsApp', ContactPhone: '71435981', ContactName: 'Ana', Lat: -17.79, Lng: -63.19,
};

describe('coverageService.getCoverageQueries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pasa params {result,limit} y mapea a camelCase', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: [QUERY] } });

    const result = await coverageService.getCoverageQueries({ result: 'NO_COVERAGE', limit: 50 });

    expect(api.get).toHaveBeenCalledWith('/coverage/queries', { params: { result: 'NO_COVERAGE', limit: 50 } });
    expect(result[0]).toMatchObject({ id: 'q1', result: 'NO_COVERAGE', channel: 'WhatsApp', lat: -17.79 });
  });
});
