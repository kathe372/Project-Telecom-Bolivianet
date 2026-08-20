import api from './api';
import type { ApiResponse } from '@/types/auth.types';

export interface SettingsDto {
  WhatsAppToken?:          string;
  WhatsAppPhoneNumberId?:  string;
  WhatsAppApiVersion?:     string;
  SlaHorasAnticipacion:   number;
  SlaHoraInicioLaboral:   number;
  SlaHoraFinLaboral:      number;
  MaxFailedLoginAttempts: number;
  AdminPhoneNumber?:      string;
  AutoSuspendActivo:      boolean;
  AutoSuspendDiasGracia:  number;
}

export const settingsService = {
  get: async (): Promise<SettingsDto> => {
    const res = await api.get<ApiResponse<SettingsDto>>('/admin/settings');
    return res.data.data!;
  },
  save: async (data: SettingsDto): Promise<void> => {
    await api.put('/admin/settings', data);
  },
};
