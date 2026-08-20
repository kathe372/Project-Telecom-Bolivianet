import api from './api';
import type { ApiResponse } from '@/types/auth.types';

interface ForgotPasswordResponse {
  Message:  string;
  Channel:  string;
  SentTo:   string | null;
}

export const passwordResetService = {
  forgotPassword: async (email: string): Promise<ForgotPasswordResponse> => {
    const res = await api.post<ApiResponse<ForgotPasswordResponse>>(
      '/users/forgot-password',
      { Email: email },
    );
    return res.data.data!;
  },

  resetPassword: async (
    token:           string,
    newPassword:     string,
    confirmPassword: string,
  ): Promise<void> => {
    await api.post('/users/reset-password', {
      Token:           token,
      NewPassword:     newPassword,
      ConfirmPassword: confirmPassword,
    });
  },
};
