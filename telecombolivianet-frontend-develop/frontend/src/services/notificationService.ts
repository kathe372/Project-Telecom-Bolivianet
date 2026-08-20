import api from './api';
import type {
  NotifType, TemplateCategory, HsmStatus,
  NotifConfigDto, NotifConfigListDto, NotifTemplateDto,
  NotifSegmentDto, SegmentConditionGroup,
  TemplatePreviewDto,
} from '@/types/notification.types';

export type {
  NotifType, TemplateCategory, HsmStatus, SegmentOperator, SegmentCampo,
  SegmentCondition, SegmentConditionGroup, NotifSegmentDto,
  NotifConfigDto, NotifConfigListDto, NotifTemplateDto,
  NotifLogItemDto, NotifLogPageDto, TemplatePreviewDto,
} from '@/types/notification.types';
export {
  NOTIF_TYPE_LABELS, NOTIF_TYPES_ACTIVOS,
  HSM_STATUS_COLORS, CATEGORIA_LABELS, ALL_VARIABLES,
} from '@/types/notification.types';


export const getNotifConfigs = async (): Promise<NotifConfigListDto> => {
  const { data } = await api.get('/config/notifications');
  return data.data;
};

export const updateNotifConfigs = async (
  configs: NotifConfigDto[],
  confirmSuspension = false,
): Promise<void> => {
  const headers: Record<string, string> = {};
  if (confirmSuspension) headers['X-Confirm-Suspension'] = 'true';
  await api.put('/config/notifications', { Configs: configs }, { headers });
};


export const getPlantillas = async (
  categoria?: TemplateCategory,
  hsmStatus?: HsmStatus,
): Promise<NotifTemplateDto[]> => {
  const params: Record<string, string> = {};
  if (categoria)  params.categoria  = categoria;
  if (hsmStatus)  params.hsmStatus  = hsmStatus;
  const { data } = await api.get('/config/notifications/templates', { params });
  return data.data;
};

export const updatePlantilla = async (
  tipo: NotifType,
  texto: string,
  categoria: TemplateCategory = 'General',
  hsmStatus: HsmStatus = 'Pendiente',
  metaTemplateName: string | null = null,
  metaLanguageCode: string | null = 'es',
  metaParamOrder: string | null = null,
): Promise<void> => {
  await api.put(`/config/notifications/templates/${tipo}`, {
    Texto: texto,
    Categoria: categoria,
    HsmStatus: hsmStatus,
    MetaTemplateName: metaTemplateName,
    MetaLanguageCode: metaLanguageCode,
    MetaParamOrder: metaParamOrder,
  });
};

export const updateHsmStatus = async (tipo: NotifType, hsmStatus: HsmStatus): Promise<void> => {
  await api.patch(`/config/notifications/templates/${tipo}/hsm`, { HsmStatus: hsmStatus });
};

export const restorePlantilla = async (tipo: NotifType): Promise<void> => {
  await api.post(`/config/notifications/templates/${tipo}/restore`);
};


export const previewPlantilla = async (
  texto: string,
  clienteId?: string,
): Promise<TemplatePreviewDto> => {
  const { data } = await api.post('/config/notifications/templates/preview', {
    Texto: texto,
    ClienteId: clienteId ?? null,
  });
  return data.data;
};


export const getSegments = async (): Promise<NotifSegmentDto[]> => {
  const { data } = await api.get('/config/notifications/segments');
  return data.data;
};


export const createSegment = async (
  dto: { Nombre: string; Descripcion: string | null; Reglas: SegmentConditionGroup[] },
): Promise<NotifSegmentDto> => {
  const { data } = await api.post('/config/notifications/segments', dto);
  return data.data;
};

export const updateSegment = async (
  id: string,
  dto: { Nombre: string; Descripcion: string | null; Reglas: SegmentConditionGroup[] },
): Promise<NotifSegmentDto> => {
  const { data } = await api.put(`/config/notifications/segments/${id}`, dto);
  return data.data;
};

export const deleteSegment = async (id: string): Promise<void> => {
  await api.delete(`/config/notifications/segments/${id}`);
};

export const previewSegment = async (
  dto: { Nombre: string; Descripcion: string | null; Reglas: SegmentConditionGroup[] },
): Promise<{ ClientesCoinciden: number }> => {
  const { data } = await api.post('/config/notifications/segments/preview', dto);
  return data.data;
};


export const bulkSend = async (
  tipo: NotifType,
  segmentId?: string,
): Promise<{ Enviados: number; OmitidosAntispam: number; SinTelefono: number }> => {
  const { data } = await api.post('/config/notifications/send-masivo', {
    Tipo: tipo,
    SegmentId: segmentId ?? null,
  });
  return data.data;
};


