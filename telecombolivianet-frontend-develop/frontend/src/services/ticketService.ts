import api from './api';
import type {
  TicketListItemDto, TicketDetailDto, TicketKpiDto, TicketCommentDto,
  TicketAttachmentDto, BalancingSummaryDto,
  TicketWorkLogDto, TicketVisitDto, SlaPlanDto, SlaAlertsDto,
  TicketActivityDto,
  CreateTicketRequest, UpdateTicketRequest, ChangeTicketStatusRequest,
  AssignTicketRequest, AddCommentRequest, AddWorkLogRequest,
  ScheduleVisitRequest, CreateSlaPlanRequest, TicketFilterRequest,
} from '@/types/ticket.types';
import type { PagedResult } from '@/types/auth.types';

const B = '/tickets';

export const ticketService = {
  getAll: async (f: TicketFilterRequest): Promise<PagedResult<TicketListItemDto>> => {
    const p = new URLSearchParams();
    if (f.Search)                  p.set('Search',      f.Search);
    if (f.Status)                  p.set('Status',      f.Status);
    if (f.Priority)                p.set('Priority',    f.Priority);
    if (f.Type)                    p.set('Type',        f.Type);
    if (f.AssignedToId)            p.set('AssignedToId',f.AssignedToId);
    if (f.OverdueSla)              p.set('OverdueSla',  'true');
    if (f.DateFrom)                p.set('DateFrom',    f.DateFrom);
    if (f.DateTo)                  p.set('DateTo',      f.DateTo);
    if (f.SlaCompliant !== undefined) p.set('SlaCompliant', String(f.SlaCompliant));
    p.set('PageNumber', String(f.PageNumber ?? 1));
    p.set('PageSize',   String(f.PageSize   ?? 20));
    return (await api.get(`${B}?${p}`)).data.data;
  },
  getById:     async (id: string): Promise<TicketDetailDto>                         => (await api.get(`${B}/${id}`)).data.data,
  getKanban:   async (f: TicketFilterRequest = {}): Promise<Record<string, TicketListItemDto[]>> => {
    const p = new URLSearchParams();
    if (f.Search)    p.set('Search',   f.Search);
    if (f.Status && f.Status !== 'all')   p.set('Status',   f.Status);
    if (f.Priority && f.Priority !== 'all') p.set('Priority', f.Priority);
    if (f.AssignedToId) p.set('AssignedToId', f.AssignedToId);
    return (await api.get(`${B}/kanban?${p}`)).data.data;
  },
  getKpi: async (f: { desde?: string; hasta?: string; tecnico?: string } = {}): Promise<TicketKpiDto> => {
    const p = new URLSearchParams();
    if (f.desde)   p.append('desde', f.desde);
    if (f.hasta)   p.append('hasta', f.hasta);
    if (f.tecnico) p.append('tecnico', f.tecnico);
    const qs = p.toString();
    return (await api.get(`${B}/kpi${qs ? `?${qs}` : ''}`)).data.data;
  },
  getOverdueSla:async (): Promise<TicketListItemDto[]>     => (await api.get(`${B}/overdue-sla`)).data.data,
  getSlaAlerts: async (): Promise<SlaAlertsDto>            => (await api.get(`${B}/sla-alerts`)).data.data,
  getByClient:  async (id: string): Promise<TicketListItemDto[]> => (await api.get(`${B}/by-client/${id}`)).data.data,

  create:       async (d: CreateTicketRequest): Promise<TicketDetailDto>  => (await api.post(B, d)).data.data,
  update:       async (id: string, d: UpdateTicketRequest): Promise<TicketDetailDto> => (await api.put(`${B}/${id}`, d)).data.data,
  changeStatus: async (id: string, d: ChangeTicketStatusRequest): Promise<TicketDetailDto> => (await api.patch(`${B}/${id}/status`, d)).data.data,
  assign:       async (id: string, d: AssignTicketRequest): Promise<TicketDetailDto> => (await api.patch(`${B}/${id}/assign`, d)).data.data,
  close:        async (id: string): Promise<TicketDetailDto>              => (await api.patch(`${B}/${id}/close`, {})).data.data,
  addComment:   async (id: string, d: AddCommentRequest): Promise<TicketCommentDto>   => (await api.post(`${B}/${id}/comments`, d)).data.data,
  addWorkLog:   async (id: string, d: AddWorkLogRequest): Promise<TicketWorkLogDto>   => (await api.post(`${B}/${id}/worklogs`, d)).data.data,
  scheduleVisit:async (id: string, d: ScheduleVisitRequest): Promise<TicketVisitDto>  => (await api.post(`${B}/${id}/visits`, d)).data.data,

  getSlaPlans:   async (): Promise<SlaPlanDto[]>  => (await api.get(`${B}/sla-plans`)).data.data,
  createSlaPlan: async (d: CreateSlaPlanRequest): Promise<SlaPlanDto> => (await api.post(`${B}/sla-plans`, d)).data.data,
  updateSlaPlan: async (id: string, d: Partial<CreateSlaPlanRequest & { IsActive: boolean }>): Promise<SlaPlanDto> => (await api.put(`${B}/sla-plans/${id}`, d)).data.data,
  deleteSlaPlan: async (id: string): Promise<void> => { await api.delete(`${B}/sla-plans/${id}`); },

  getTypes: async (): Promise<string[]> => (await api.get(`${B}/types`)).data.data,

  getBalanceoResumen: async (): Promise<BalancingSummaryDto> =>
    (await api.get(`${B}/balanceo`)).data.data,

  getAttachments: async (id: string): Promise<TicketAttachmentDto[]> =>
    (await api.get(`${B}/${id}/attachments`)).data.data,

  uploadAttachment: async (
    id: string, file: File, descripcion?: string,
  ): Promise<TicketAttachmentDto> => {
    const form = new FormData();
    form.append('file', file);
    if (descripcion) form.append('descripcion', descripcion);
    return (await api.post(`${B}/${id}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })).data.data;
  },

  deleteAttachment: async (ticketId: string, attId: string): Promise<void> => {
    await api.delete(`${B}/${ticketId}/attachments/${attId}`);
  },

  downloadAttachment: (ticketId: string, attId: string): void => {
    window.open(`/api/tickets/${ticketId}/attachments/${attId}/download`, '_blank');
  },

  reopen: async (id: string, motivo: string): Promise<void> => {
    await api.post(`${B}/${id}/reopen`, { Motivo: motivo });
  },

  getActivity: async (id: string): Promise<TicketActivityDto[]> =>
    (await api.get(`${B}/${id}/activity`)).data.data,
};
