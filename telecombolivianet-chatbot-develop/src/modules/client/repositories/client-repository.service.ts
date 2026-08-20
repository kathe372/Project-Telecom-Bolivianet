import { Injectable } from '@nestjs/common';
import { BaseApiService } from '../http/base-api.service';
import { AuthTokenService } from '../http/auth-token.service';
import { IClientRepository } from '../sistema-api.interfaces';
import { ClientBotDto, InvoiceDto } from '../sistema-api.service';

@Injectable()
export class ClientRepositoryService extends BaseApiService implements IClientRepository {
  constructor(auth: AuthTokenService) {
    super(auth);
  }

  async getClientByPhone(phone: string): Promise<ClientBotDto | null> {
    try {
      const normalized = phone.startsWith('591') && phone.length > 3 ? phone.slice(3) : phone;
      return await this.get<ClientBotDto>('/api/clients/by-phone', { phone: normalized });
    } catch (err: any) {
      if (err.response?.status === 404) return null;
      this.logger.error(`getClientByPhone error: ${err.message}`);
      throw err;
    }
  }

  async getClientsByPhone(phone: string): Promise<ClientBotDto[]> {
    const normalized = phone.startsWith('591') && phone.length > 3 ? phone.slice(3) : phone;
    const data = await this.get<ClientBotDto[]>('/api/clients/by-phone-all', { phone: normalized });
    return data ?? [];
  }

  async getClientInvoices(clientId: string, year?: number): Promise<InvoiceDto[]> {
    const data = await this.get<{ Invoices: InvoiceDto[] }>(
      `/api/clients/${clientId}/invoices/bot`,
      { year: year ?? new Date().getFullYear() },
    );
    return data?.Invoices ?? [];
  }

  async getPendingInvoices(clientId: string): Promise<InvoiceDto[]> {
    const invoices = await this.getClientInvoices(clientId);
    return invoices.filter((i) => i.Status === 'Pendiente' || i.Status === 'Vencida');
  }

  async requestPlanChange(clientId: string, newPlanId: string, notes?: string): Promise<{ changeId: string }> {
    return this.post<{ changeId: string }>('/api/clients/request-plan-change', {
      ClientId: clientId, NewPlanId: newPlanId, Notes: notes,
    });
  }
}
