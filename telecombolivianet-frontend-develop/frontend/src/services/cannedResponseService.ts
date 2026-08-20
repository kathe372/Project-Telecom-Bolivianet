import api from './api';
import type { CannedResponseDto } from '@/types/ticket.types';
import type { ApiResponse } from '@/types/auth.types';

export interface CreateCannedResponseRequest {
  Title: string;
  Body: string;
  Category?: string;
}

export interface UpdateCannedResponseRequest {
  Title?: string;
  Body?: string;
  Category?: string;
  IsActive?: boolean;
}

export const cannedResponseService = {
  getAll: async (includeInactive = false): Promise<CannedResponseDto[]> => {
    const res = await api.get<ApiResponse<CannedResponseDto[]>>(
      `/canned-responses?includeInactive=${includeInactive}`
    );
    return res.data.data!;
  },

  create: async (data: CreateCannedResponseRequest): Promise<CannedResponseDto> => {
    const res = await api.post<ApiResponse<CannedResponseDto>>('/canned-responses', data);
    return res.data.data!;
  },

  update: async (id: string, data: UpdateCannedResponseRequest): Promise<CannedResponseDto> => {
    const res = await api.put<ApiResponse<CannedResponseDto>>(`/canned-responses/${id}`, data);
    return res.data.data!;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/canned-responses/${id}`);
  },
};
