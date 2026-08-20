import api from './api';
import type {
  ClientListItemDto, ClientDetailDto,
  InvoiceGridDto, RegisterClientRequest,
  UpdateClientRequest, RegisterPaymentRequest,
  ClientFilterDto, ClientQrInfoDto,
  PlanChangeRequestDto, PlanChangeHistoryDto,
  PlanHistoryDto,
} from '@/types/client.types';
import type { PagedResult, ApiResponse } from '@/types/auth.types';

export const clientService = {
  peekTbn: async (): Promise<string> => {
    const res = await api.get<ApiResponse<{ NextTbn: string }>>('/clients/next-tbn');
    return res.data.data!.NextTbn;
  },

  getByPhone: async (phone: string): Promise<ClientDetailDto | null> => {
    try {
      const res = await api.get<ApiResponse<ClientDetailDto>>('/clients/by-phone', { params: { phone } });
      return res.data.data ?? null;
    } catch {
      return null;
    }
  },

  getAll: async (filter: ClientFilterDto = {}): Promise<PagedResult<ClientListItemDto>> => {
    const res = await api.get<ApiResponse<PagedResult<ClientListItemDto>>>(
      '/clients', { params: filter });
    return res.data.data!;
  },

  getById: async (id: string): Promise<ClientDetailDto> => {
    const res = await api.get<ApiResponse<ClientDetailDto>>(`/clients/${id}`);
    return res.data.data!;
  },

  getInvoices: async (id: string, year?: number): Promise<InvoiceGridDto> => {
    const res = await api.get<ApiResponse<InvoiceGridDto>>(
      `/clients/${id}/invoices`, { params: year ? { year } : undefined });
    return res.data.data!;
  },

  register: async (data: RegisterClientRequest): Promise<ClientListItemDto> => {
    const res = await api.post<ApiResponse<ClientListItemDto>>('/clients', data);
    return res.data.data!;
  },

  update: async (id: string, data: UpdateClientRequest): Promise<void> => {
    await api.put(`/clients/${id}`, data);
  },

  suspend:    async (id: string): Promise<void> => { await api.put(`/clients/${id}/suspend`); },
  reactivate: async (id: string): Promise<void> => { await api.put(`/clients/${id}/reactivate`); },

  cancel: async (id: string, confirmed = false): Promise<{ requiresConfirmation?: boolean }> => {
    try {
      await api.put(`/clients/${id}/cancel`, null, { params: { confirmed } });
      return {};
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { requiresConfirmation?: boolean } } };
      if (e.response?.status === 409) return { requiresConfirmation: true };
      throw err;
    }
  },

  registerPayment: async (id: string, data: RegisterPaymentRequest): Promise<void> => {
    await api.post(`/clients/${id}/payments`, data);
  },

  getQrInfo: async (clientId: string): Promise<ClientQrInfoDto | null> => {
    const res = await api.get<ApiResponse<ClientQrInfoDto>>(`/clients/${clientId}/qr/info`);
    return res.data.data ?? null;
  },
  uploadQr: async (clientId: string, file: File, expiresInDays: number): Promise<void> => {
    const form = new FormData();
    form.append('file', file);
    form.append('ExpiresInDays', String(expiresInDays));
    await api.post(`/clients/${clientId}/qr`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

import type { PlanDto } from '@/types/client.types';

export const planService = {
  getAll: async (onlyActive = false): Promise<PlanDto[]> => {
    const res = await api.get<ApiResponse<PlanDto[]>>(
      '/plans', { params: { onlyActive } });
    return res.data.data!;
  },
  create: async (data: { Name: string; SpeedMb: number; MonthlyPrice: number }): Promise<void> => {
    await api.post('/plans', data);
  },
  update: async (id: string, data: { Name: string; SpeedMb: number; MonthlyPrice: number; IsActive: boolean; ChangeReason?: string }): Promise<void> => {
    await api.put(`/plans/${id}`, data);
  },
  getHistory: async (id: string): Promise<PlanHistoryDto[]> => {
    const res = await api.get<ApiResponse<PlanHistoryDto[]>>(`/plans/${id}/history`);
    return res.data.data ?? [];
  },
};


export const TIPO_DOC_LABELS: Record<string, string> = {
  CI:          'Cédula de Identidad',
  NIT:         'NIT',
  Contrato:    'Contrato',
  Foto:        'Fotografía',
  Recibo:      'Recibo de Pago',
  Comprobante: 'Comprobante',
  Otro:        'Otro',
};

export const TIPO_DOC_ICONS: Record<string, string> = {
  CI: '🪪', NIT: '📋', Contrato: '📄', Foto: '📷', Recibo: '🧾', Comprobante: '🧾', Otro: '📎',
};

export interface ClientAttachmentDto {
  Id: string;
  FileName: string;
  TipoDoc: string;
  ContentType: string;
  FileSizeBytes: number;
  Descripcion: string | null;
  StoragePath: string;
  SubidoPorNombre: string;
  SubidoAt: string;
}

export interface ClientActivityItemDto {
  Id: string;
  Tipo: string;
  Descripcion: string;
  Actor: string;
  OcurridoAt: string;
  Referencia: string | null;
  Detalle: string | null;
}

export interface ClientHistoryDto {
  Items: ClientActivityItemDto[];
  Total: number;
  Page: number;
  PageSize: number;
}

export interface ClientSearchDto {
  Query?: string;
  Zone?: string;
  Status?: string;
  PlanId?: string;
  HasDebt?: boolean;
  HasEmail?: boolean;
  Page?: number;
  PageSize?: number;
}

export interface ClientSearchResultDto {
  Items: import('@/types/client.types').ClientListItemDto[];
  Total: number;
  Page: number;
  PageSize: number;
  AppliedQuery: string | null;
}


export const searchClients = async (dto: ClientSearchDto): Promise<ClientSearchResultDto> => {
  const res = await api.post('/clients/search', dto);
  return res.data.data;
};

export const getAttachments = async (clientId: string): Promise<ClientAttachmentDto[]> => {
  const res = await api.get(`/clients/${clientId}/attachments`);
  return res.data.data;
};

export const uploadAttachment = async (
  clientId: string,
  file: File,
  tipoDoc: string,
  descripcion?: string,
): Promise<ClientAttachmentDto> => {
  const form = new FormData();
  form.append('file', file);
  form.append('tipoDoc', tipoDoc);
  if (descripcion) form.append('descripcion', descripcion);
  const res = await api.post(`/clients/${clientId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
};

export const deleteAttachment = async (clientId: string, attachId: string): Promise<void> => {
  await api.delete(`/clients/${clientId}/attachments/${attachId}`);
};

export const downloadAttachment = (clientId: string, attachId: string): void => {
  window.open(`/api/clients/${clientId}/attachments/${attachId}/download`, '_blank');
};

export const getClientHistorial = async (
  clientId: string,
  page = 1,
  pageSize = 25,
  tipo?: string,
  desde?: string,
  hasta?: string,
): Promise<ClientHistoryDto> => {
  const params: Record<string, unknown> = { page, pageSize };
  if (tipo)  params.tipo  = tipo;
  if (desde) params.desde = desde;
  if (hasta) params.hasta = hasta;
  const res = await api.get(`/clients/${clientId}/historial`, { params });
  return res.data.data;
};

export const planChangeService = {
  getPending: async (clientId?: string | null): Promise<PlanChangeRequestDto[]> => {
    const res = await api.get<ApiResponse<PlanChangeRequestDto[]>>(
      '/plan-changes/pending', { params: clientId ? { clientId } : {} });
    return res.data.data ?? [];
  },
  request: async (clientId: string, newPlanId: string, notes?: string): Promise<void> => {
    await api.post(`/clients/${clientId}/plan-change`, { NewPlanId: newPlanId, Notes: notes });
  },
  approve: async (id: string, midMonth: boolean): Promise<void> => {
    await api.patch(`/plan-changes/${id}/approve`, null, { params: { midMonth } });
  },
  reject: async (id: string, motivo: string): Promise<void> => {
    await api.patch(`/plan-changes/${id}/reject`, { Motivo: motivo });
  },
  getHistorial: async (clientId: string): Promise<PlanChangeHistoryDto[]> => {
    const res = await api.get<ApiResponse<PlanChangeHistoryDto[]>>(
      `/clients/${clientId}/plan-changes`);
    return res.data.data ?? [];
  },
};
