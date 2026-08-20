import api from './api';
import type {
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  ApiResponse,
} from '@/types/auth.types';

export const authService = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const res = await api.post<ApiResponse<LoginResponse>>('/auth/login', data);
    return res.data.data!;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  changePassword: async (data: ChangePasswordRequest): Promise<void> => {
    await api.put('/auth/change-password', data);
  },

  me: async () => {
    const res = await api.get<ApiResponse<{ UserId: string; FullName: string; Role: string }>>('/auth/me');
    return res.data.data!;
  },
};
