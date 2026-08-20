import api from './api';
import type { ApiResponse } from '@/types/auth.types';

/** Datos que encabezan todos los reportes exportados (PDF, Excel, CSV). */
export interface CompanyProfileDto {
  Name:         string;
  LegalName:    string | null;
  Nit:          string | null;
  Address:      string | null;
  City:         string | null;
  Phone:        string | null;
  Email:        string | null;
  Website:      string | null;
  Tagline:      string | null;
  LogoBase64:   string | null;
  PrimaryColor: string;
  FooterLegal:  string | null;
}

export const companyProfileService = {
  get: async (): Promise<CompanyProfileDto> => {
    const res = await api.get<ApiResponse<CompanyProfileDto>>('/admin/company-profile');
    return res.data.data!;
  },

  save: async (dto: CompanyProfileDto): Promise<CompanyProfileDto> => {
    const res = await api.put<ApiResponse<CompanyProfileDto>>('/admin/company-profile', dto);
    return res.data.data!;
  },
};
