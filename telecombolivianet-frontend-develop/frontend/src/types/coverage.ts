export type CoverageZoneStatus = 'Activa' | 'EnExpansion' | 'Planificada' | 'Inactiva';
export type DistributionBoxStatus = 'Activo' | 'Saturado' | 'Mantenimiento';

export interface CoverageZone {
  id:                    string;
  nombre:                string;
  tecnologia:            string;
  velocidadMaxMbps:      number;
  estado:                CoverageZoneStatus;
  fechaExpansionEstimada?: string;
  geoJson?:              string;
  boxCount?:             number;
}

export interface DistributionBox {
  id:                     string;
  codigo:                 string;
  direccionReferencia:    string;
  zoneId:                 string;
  zoneName:               string;
  lat:                    number;
  lng:                    number;
  puertosTotal:           number;
  puertosOcupados:        number;
  puertosReservados:      number;
  puertosLibres:          number;
  distanciaMaxCableMetros?: number;
  estado:                 DistributionBoxStatus;
}

export interface ClientLocation {
  id:        string;
  tbnCode:   string;
  fullName:  string;
  status:    string;
  lat:       number;
  lng:       number;
  boxCodigo?: string;
}

export interface CreateCoverageZoneRequest {
  nombre:                 string;
  tecnologia:             string;
  velocidadMaxMbps:       number;
  estado:                 CoverageZoneStatus;
  fechaExpansionEstimada?: string;
  geoJson:                string;
}

export interface UpdateCoverageZoneRequest {
  nombre:                 string;
  tecnologia:             string;
  velocidadMaxMbps:       number;
  estado:                 CoverageZoneStatus;
  fechaExpansionEstimada?: string;
  geoJson?:               string;
}

export interface CreateDistributionBoxRequest {
  codigo:                  string;
  direccionReferencia:     string;
  zoneId:                  string;
  lat:                     number;
  lng:                     number;
  puertosTotal:            number;
  distanciaMaxCableMetros?: number;
}

export interface UpdateDistributionBoxRequest {
  codigo:                  string;
  direccionReferencia:     string;
  puertosTotal:            number;
  puertosOcupados:         number;
  distanciaMaxCableMetros?: number;
  estado:                  DistributionBoxStatus;
  /** Reubicación del pin en el mapa (F7) — solo si el pin se movió. */
  lat?:                    number;
  lng?:                    number;
}

/** Respuesta de GET /coverage/check (serviciabilidad, F7). */
export interface CoverageCheckResponse {
  outcome:                  'CONFIRMED' | 'ESCALATE' | 'NOCOVERAGE';
  zoneName:                 string | null;
  zoneTechnology:           string | null;
  escalationReason:         string | null;
  recommendedBoxCodigo:     string | null;
  recommendedBoxPuertosLibres: number | null;
  nearestBoxDistanceMeters: number | null;
}

/** PR-4b: puerto individual de una caja NAP (read-model: quién/ONU + estado). */
export type NapPortStatus = 'Free' | 'Used' | 'Reserved' | 'Damaged';

export interface NapPort {
  numero:          number;
  status:          NapPortStatus;
  accountId?:      string;
  onuSerial?:      string;
  installationId?: string;
  updatedAt:       string;
}

/** PR-2: fila del reporte de demanda de cobertura. */
export interface CoverageQuery {
  id:            string;
  queriedAt:     string;
  result:        string;
  zoneName?:     string;
  channel:       string;
  contactPhone?: string;
  contactName?:  string;
  lat:           number;
  lng:           number;
}
