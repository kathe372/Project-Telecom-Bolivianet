import api from './api';
import type { AuditLogDto, PagedResult, ApiResponse } from '@/types/auth.types';

export interface AuditLogFilter {
  userId?:    string;
  action?:    string;
  module?:    string;
  search?:    string;
  from?:      string;
  to?:        string;
  pageNumber?: number;
  pageSize?:   number;
}

export const auditService = {
  getAll: async (filter: AuditLogFilter = {}): Promise<PagedResult<AuditLogDto>> => {
    const res = await api.get<ApiResponse<PagedResult<AuditLogDto>>>(
      '/audit-logs', { params: filter }
    );
    return res.data.data!;
  },

  exportCsv: (filter: Omit<AuditLogFilter, 'pageNumber' | 'pageSize'> = {}): void => {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([k, v]) => { if (v) params.append(k, String(v)); });
    const base = (import.meta.env.VITE_API_URL ?? '') + '/api';
    window.open(`${base}/audit-logs/export?${params.toString()}`, '_blank');
  },
};
