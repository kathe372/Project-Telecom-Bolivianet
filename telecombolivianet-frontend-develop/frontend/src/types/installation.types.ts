export type InstallationStatus =
  | 'Pendiente'
  | 'EnProceso'
  | 'Completada'
  | 'Cancelada'
  | 'Reprogramada'
  | 'NoRealizada';

export const STATUS_LABEL: Record<InstallationStatus, string> = {
  Pendiente:    'Pendiente',
  EnProceso:    'En proceso',
  Completada:   'Completada',
  Cancelada:    'Cancelada',
  Reprogramada: 'Reprogramada',
  NoRealizada:  'No realizada',
};

export const STATUS_COLOR: Record<InstallationStatus, string> = {
  Pendiente:    'bg-blue-100 text-blue-800',
  EnProceso:    'bg-amber-100 text-amber-800',
  Completada:   'bg-green-100 text-green-800',
  Cancelada:    'bg-red-100 text-red-700',
  Reprogramada: 'bg-purple-100 text-purple-800',
  NoRealizada:  'bg-orange-100 text-orange-800',
};

export interface SlotDto {
  Fecha:       string;
  HoraInicio:  string;
  HoraFin:     string;
  Disponibles: number;
  Disponible:  boolean;
}

export interface InstallationListItemDto {
  Id:            string;
  ClienteTbn:    string;
  ClienteNombre: string;
  PlanNombre:    string;
  Fecha:         string;
  HoraInicio:    string;
  Status:        InstallationStatus;
  TecnicoNombre: string | null;
  TicketId:      string | null;
  CreadoAt:      string;
  BoxCodigo?:    string | null;
  ClientePhone?: string | null;
  DuracionMin?:  number | null;
  TecnicoId?:    string | null;
}

export interface AssignedTechnicianDto {
  TechnicianId:   string;
  TechnicianName: string;
  IsLead:         boolean;
  AssignedAt:     string;
}

// Type es el Type real del ticket (SoporteTecnico, RecoleccionEquipo, etc.)
// cuando el item viene de una visita de ticket, o 'Instalacion' cuando es
// una instalación propiamente dicha.
export interface AgendaItemDto {
  Id:         string;
  Type:       string;
  ClienteNombre: string;
  Fecha:      string;
  HoraInicio: string;
  HoraFin:    string;
  Direccion:  string;
  Status:     string;
  ClientePhone?: string | null;
  PlanNombre?:   string | null;
  Notas?:        string | null;
  MapsLink?:     string | null;
  TecnicoId?:    string | null;
  TicketId?:     string | null;
}

export interface InstallationDetailDto {
  Id:                string;
  ClienteTbn:        string;
  ClienteNombre:     string;
  ClientePhone:      string;
  PlanNombre:        string;
  Fecha:             string;
  HoraInicio:        string;
  HoraFin:           string;
  DuracionMin:       number;
  Direccion:         string;
  Notas:             string | null;
  Status:            InstallationStatus;
  TecnicoNombre:     string | null;
  TecnicoId:         string | null;
  Tecnicos:          AssignedTechnicianDto[];
  GpsLatitude:       number | null;
  GpsLongitude:      number | null;
  LocationSource:    string | null;
  MapsLink:          string | null;
  TicketId:          string | null;
  CalendarLink:      string | null;
  MotivoCancelacion: string | null;
  CanceladoPor:      string | null;
  CreadoAt:          string;
  DistributionBoxId?: string | null;
  BoxCodigo?:         string | null;
  PlanId?:            string | null;
}

export interface PagedResult<T> {
  Items:      T[];
  TotalCount: number;
  PageNumber: number;
  PageSize:   number;
  TotalPages: number;
}

export interface InstallationFilterDto {
  status?:         string;
  fecha?:          string;
  tecnicoId?:      string;
  clienteId?:      string;
  soloProspectos?: boolean;
  page?:           number;
  pageSize?:       number;
}

export interface CreateInstallationAdminDto {
  ClienteId:   string;
  PlanId:      string;
  Fecha:       string;
  HoraInicio:  string;
  DuracionMin?: number;
  Direccion:   string;
  Notas?:      string;
  TecnicoId?:  string;
}

/** Punto 8: franja disponible para agendar una instalación. */
export interface SlotDisponible {
  fecha:       string;
  horaInicio:  string;
  horaFin:     string;
  disponibles: number;
  disponible:  boolean;
}
