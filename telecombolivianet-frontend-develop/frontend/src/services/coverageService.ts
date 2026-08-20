import api from './api';
import type {
  CoverageZone, DistributionBox, ClientLocation,
  CreateCoverageZoneRequest, UpdateCoverageZoneRequest,
  CreateDistributionBoxRequest, UpdateDistributionBoxRequest,
  CoverageCheckResponse, NapPort, NapPortStatus, CoverageQuery,
} from '@/types/coverage';
import type { ApiResponse } from '@/types/auth.types';

// PR-4b / PR-2: adaptadores PascalCase (backend) → camelCase (frontend).
interface ApiNapPort {
  Numero: number; Status: string; AccountId?: string | null;
  OnuSerial?: string | null; InstallationId?: string | null; UpdatedAt: string;
}
const toPort = (p: ApiNapPort): NapPort => ({
  numero: p.Numero, status: p.Status as NapPortStatus, accountId: p.AccountId ?? undefined,
  onuSerial: p.OnuSerial ?? undefined, installationId: p.InstallationId ?? undefined,
  updatedAt: p.UpdatedAt,
});

interface ApiCoverageQuery {
  Id: string; QueriedAt: string; Result: string; ZoneName?: string | null;
  Channel: string; ContactPhone?: string | null; ContactName?: string | null;
  Lat: number; Lng: number;
}
const toQuery = (q: ApiCoverageQuery): CoverageQuery => ({
  id: q.Id, queriedAt: q.QueriedAt, result: q.Result, zoneName: q.ZoneName ?? undefined,
  channel: q.Channel, contactPhone: q.ContactPhone ?? undefined,
  contactName: q.ContactName ?? undefined, lat: q.Lat, lng: q.Lng,
});

// El backend serializa en PascalCase (PropertyNamingPolicy = null);
// estos adaptadores convierten a los tipos camelCase del frontend.
interface ApiZone {
  Id: string; Nombre: string; Tecnologia: string; VelocidadMaxMbps: number;
  Estado: string; FechaExpansionEstimada?: string | null;
  GeoJson?: string | null; BoxCount?: number;
}

interface ApiBox {
  Id: string; Codigo: string; DireccionReferencia: string;
  ZoneId: string; ZoneName: string; Lat: number; Lng: number;
  PuertosTotal: number; PuertosOcupados: number; PuertosReservados: number;
  PuertosLibres: number; DistanciaMaxCableMetros?: number | null; Estado: string;
}

const toZone = (z: ApiZone): CoverageZone => ({
  id:                     z.Id,
  nombre:                 z.Nombre,
  tecnologia:             z.Tecnologia,
  velocidadMaxMbps:       z.VelocidadMaxMbps,
  estado:                 z.Estado as CoverageZone['estado'],
  fechaExpansionEstimada: z.FechaExpansionEstimada ?? undefined,
  geoJson:                z.GeoJson ?? undefined,
  boxCount:               z.BoxCount,
});

const toBox = (b: ApiBox): DistributionBox => ({
  id:                      b.Id,
  codigo:                  b.Codigo,
  direccionReferencia:     b.DireccionReferencia,
  zoneId:                  b.ZoneId,
  zoneName:                b.ZoneName,
  lat:                     b.Lat,
  lng:                     b.Lng,
  puertosTotal:            b.PuertosTotal,
  puertosOcupados:         b.PuertosOcupados,
  puertosReservados:       b.PuertosReservados,
  puertosLibres:           b.PuertosLibres,
  distanciaMaxCableMetros: b.DistanciaMaxCableMetros ?? undefined,
  estado:                  b.Estado as DistributionBox['estado'],
});

export const coverageService = {
  getZones: async (includeGeometry = false): Promise<CoverageZone[]> => {
    const res = await api.get<ApiResponse<ApiZone[]>>(
      '/coverage/zones', { params: { includeGeometry } });
    return (res.data.data ?? []).map(toZone);
  },

  createZone: async (data: CreateCoverageZoneRequest): Promise<CoverageZone> => {
    const res = await api.post<ApiResponse<ApiZone>>('/coverage/zones', data);
    return toZone(res.data.data!);
  },

  updateZone: async (id: string, data: UpdateCoverageZoneRequest): Promise<CoverageZone> => {
    const res = await api.put<ApiResponse<ApiZone>>(`/coverage/zones/${id}`, data);
    return toZone(res.data.data!);
  },

  deleteZone: async (id: string): Promise<void> => {
    await api.delete(`/coverage/zones/${id}`);
  },

  getClientLocations: async (): Promise<ClientLocation[]> => {
    const res = await api.get<ApiResponse<Array<{
      Id: string; TbnCode: string; FullName: string; Status: string;
      Lat: number; Lng: number; BoxCodigo?: string | null;
    }>>>('/coverage/client-locations');
    return (res.data.data ?? []).map(c => ({
      id: c.Id, tbnCode: c.TbnCode, fullName: c.FullName, status: c.Status,
      lat: c.Lat, lng: c.Lng, boxCodigo: c.BoxCodigo ?? undefined,
    }));
  },

  getAllBoxes: async (): Promise<DistributionBox[]> => {
    const res = await api.get<ApiResponse<ApiBox[]>>('/coverage/boxes');
    return (res.data.data ?? []).map(toBox);
  },

  getBoxesByZone: async (zoneId: string): Promise<DistributionBox[]> => {
    const res = await api.get<ApiResponse<ApiBox[]>>(
      `/coverage/zones/${zoneId}/boxes`);
    return (res.data.data ?? []).map(toBox);
  },

  createBox: async (data: CreateDistributionBoxRequest): Promise<DistributionBox> => {
    const res = await api.post<ApiResponse<ApiBox>>('/coverage/boxes', data);
    return toBox(res.data.data!);
  },

  updateBox: async (id: string, data: UpdateDistributionBoxRequest): Promise<DistributionBox> => {
    const res = await api.put<ApiResponse<ApiBox>>(`/coverage/boxes/${id}`, data);
    return toBox(res.data.data!);
  },

  deleteBox: async (id: string): Promise<void> => {
    await api.delete(`/coverage/boxes/${id}`);
  },

  // Serviciabilidad (F7): mismo endpoint que usa el chatbot para verificar
  // cobertura de un punto exacto.
  checkCoverage: async (lat: number, lng: number): Promise<CoverageCheckResponse> => {
    const res = await api.get<ApiResponse<{
      Outcome: string; ZoneName?: string | null; ZoneTechnology?: string | null;
      EscalationReason?: string | null; RecommendedBoxCodigo?: string | null;
      RecommendedBoxPuertosLibres?: number | null; NearestBoxDistanceMeters?: number | null;
    }>>('/coverage/check', { params: { lat, lng } });
    const d = res.data.data!;
    return {
      outcome:                  d.Outcome as CoverageCheckResponse['outcome'],
      zoneName:                 d.ZoneName ?? null,
      zoneTechnology:           d.ZoneTechnology ?? null,
      escalationReason:         d.EscalationReason ?? null,
      recommendedBoxCodigo:     d.RecommendedBoxCodigo ?? null,
      recommendedBoxPuertosLibres: d.RecommendedBoxPuertosLibres ?? null,
      nearestBoxDistanceMeters: d.NearestBoxDistanceMeters ?? null,
    };
  },

  // PR-4b: puertos individuales de una caja (reconcilia + devuelve).
  getBoxPorts: async (boxId: string): Promise<NapPort[]> => {
    const res = await api.get<ApiResponse<ApiNapPort[]>>(`/coverage/boxes/${boxId}/ports`);
    return (res.data.data ?? []).map(toPort);
  },

  damagePort: async (boxId: string, numero: number): Promise<void> => {
    await api.post(`/coverage/boxes/${boxId}/ports/${numero}/damage`);
  },

  repairPort: async (boxId: string, numero: number): Promise<void> => {
    await api.post(`/coverage/boxes/${boxId}/ports/${numero}/repair`);
  },

  // PR-2: reporte de demanda de cobertura (dónde consultaron y no llegamos).
  getCoverageQueries: async (
    params: { result?: string; limit?: number } = {},
  ): Promise<CoverageQuery[]> => {
    const res = await api.get<ApiResponse<ApiCoverageQuery[]>>('/coverage/queries', { params });
    return (res.data.data ?? []).map(toQuery);
  },
};
