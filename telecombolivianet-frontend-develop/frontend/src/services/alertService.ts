import api from './api';
import type { InternalAlertDto } from '@/types/alert.types';
import type { ApiResponse } from '@/types/auth.types';

export const alertService = {
  getUnread: async (): Promise<InternalAlertDto[]> => {
    const res = await api.get<ApiResponse<InternalAlertDto[]>>('/alerts');
    return res.data.data ?? [];
  },

  markRead: async (id: string): Promise<void> => {
    await api.patch(`/alerts/${id}/read`);
  },

  markAllRead: async (): Promise<void> => {
    await api.patch('/alerts/read-all');
  },
};
