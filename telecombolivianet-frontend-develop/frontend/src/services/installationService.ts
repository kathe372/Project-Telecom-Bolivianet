import api from './api';
import type {
  InstallationListItemDto, InstallationDetailDto,
  PagedResult, InstallationFilterDto, CreateInstallationAdminDto,
  SlotDisponible, AgendaItemDto,
} from '@/types/installation.types';

// Punto 8: franjas disponibles para agendar (según capacidad real del backend).
export const getAvailableSlots = async (
  params: { dias?: number; planId?: string },
): Promise<SlotDisponible[]> => {
  const { data } = await api.get('/instalaciones/slots-disponibles', { params });
  return (data.data ?? []).map((s: {
    Fecha: string; HoraInicio: string; HoraFin: string; Disponibles: number; Disponible: boolean;
  }) => ({
    fecha: s.Fecha, horaInicio: s.HoraInicio, horaFin: s.HoraFin,
    disponibles: s.Disponibles, disponible: s.Disponible,
  }));
};

export type {
  InstallationStatus, SlotDto, InstallationListItemDto, InstallationDetailDto,
  PagedResult, InstallationFilterDto, CreateInstallationAdminDto,
  AssignedTechnicianDto, AgendaItemDto,
} from '@/types/installation.types';
export { STATUS_LABEL, STATUS_COLOR } from '@/types/installation.types';


export const getInstallations = async (
  filter: InstallationFilterDto = {}
): Promise<PagedResult<InstallationListItemDto>> => {
  const { data } = await api.get('/instalaciones', { params: filter });
  return data.data;
};

// Eventos del calendario en un rango de fechas (yyyy-MM-dd), opcionalmente por
// técnico. Mismo DTO que la lista (con DuracionMin/TecnicoId). Ver PLAN_CALENDARIO.md.
export const getCalendarEvents = async (
  desde: string, hasta: string, tecnicoId?: string
): Promise<InstallationListItemDto[]> => {
  const { data } = await api.get('/instalaciones/calendario', {
    params: { desde, hasta, ...(tecnicoId ? { tecnicoId } : {}) },
  });
  return data.data;
};

// Visitas de tickets (soporte técnico, recolección de equipo, etc.) en el
// mismo rango — solo lectura, para superponerlas al calendario de instalaciones.
export const getTicketCalendarVisits = async (
  desde: string, hasta: string, tecnicoId?: string
): Promise<AgendaItemDto[]> => {
  const { data } = await api.get('/instalaciones/calendario/visitas-tickets', {
    params: { desde, hasta, ...(tecnicoId ? { tecnicoId } : {}) },
  });
  return data.data;
};

// Técnicos activos para el tablero de despacho (Fase 3, solo-Admin). Usa el
// parámetro correcto `roleFilter` del backend (AdminOnly).
export const getTechnicians = async (): Promise<{ id: string; nombre: string }[]> => {
  const { data } = await api.get('/users', {
    params: { roleFilter: 'Tecnico', pageSize: 100 },
  });
  const items = data.data?.Items ?? [];
  return items
    .filter((u: { Status?: string }) => u.Status === 'Activo')
    .map((u: { Id: string; FullName: string }) => ({ id: u.Id, nombre: u.FullName }));
};

export const getInstallationDetail = async (
  id: string
): Promise<InstallationDetailDto> => {
  const { data } = await api.get(`/instalaciones/${id}`);
  return data.data;
};

// Reprogramar (arrastrar/redimensionar en el calendario). DuracionMin opcional
// (resize). El backend valida capacidad y rechaza si no hay disponibilidad.
export const rescheduleInstallation = async (
  id: string, dto: { Fecha: string; HoraInicio: string; DuracionMin?: number }
): Promise<void> => {
  await api.patch(`/instalaciones/${id}/reprogramar`, dto);
};


export const createInstallation = async (
  dto: CreateInstallationAdminDto
): Promise<InstallationDetailDto> => {
  const { data } = await api.post('/instalaciones/admin', dto);
  return data.data;
};

export const cancelInstallation = async (
  id: string, motivo: string
): Promise<void> => {
  await api.patch(`/instalaciones/${id}/cancelar`, {
    MotivoCancelacion: motivo,
    CanceladoPor: 'ADMIN',
  });
};

export interface CompleteEvidence {
  equipoOnuSerial?: string;
  metrosDrop?:      number;
  checklist?:       Record<string, boolean>;
  fotosUrls?:       string[];
}

export const completeInstallation = async (
  id: string, notasTecnico?: string, distributionBoxId?: string,
  evidence?: CompleteEvidence,
): Promise<void> => {
  await api.patch(`/instalaciones/${id}/completar`, {
    NotasTecnico:      notasTecnico,
    DistributionBoxId: distributionBoxId,
    EquipoOnuSerial:   evidence?.equipoOnuSerial,
    MetrosDrop:        evidence?.metrosDrop,
    ChecklistJson:     evidence?.checklist ? JSON.stringify(evidence.checklist) : undefined,
    FotosUrls:         evidence?.fotosUrls,
  });
};

export const uploadInstallationPhoto = async (
  id: string, file: File
): Promise<string> => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post(`/instalaciones/${id}/fotos`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data.Url;
};


export const markInstallationNoShow = async (
  id: string, motivo: string
): Promise<void> => {
  await api.patch(`/instalaciones/${id}/no-realizada`, { Motivo: motivo });
};

export const assignInstallationBox = async (
  id: string, distributionBoxId: string
): Promise<void> => {
  await api.patch(`/instalaciones/${id}/caja`, { DistributionBoxId: distributionBoxId });
};

export const assignTechnicians = async (
  id: string, tecnicoIds: string[], tecnicoLeadId: string
): Promise<void> => {
  await api.post(`/instalaciones/${id}/tecnicos`, { TecnicoIds: tecnicoIds, TecnicoLeadId: tecnicoLeadId });
};
