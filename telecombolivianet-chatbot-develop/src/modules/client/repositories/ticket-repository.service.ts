import { Injectable } from '@nestjs/common';
import { BaseApiService } from '../http/base-api.service';
import { AuthTokenService } from '../http/auth-token.service';
import { ITicketRepository, TicketMutationResult, TicketSummaryDto } from '../sistema-api.interfaces';
import { TicketCreateDto, TicketSlotDto } from '../sistema-api.service';

@Injectable()
export class TicketRepositoryService extends BaseApiService implements ITicketRepository {
  constructor(auth: AuthTokenService) {
    super(auth);
  }

  async createTicket(dto: TicketCreateDto): Promise<{ Id: string; TicketNumber?: string }> {
    return this.post('/api/tickets', dto);
  }

  buildTicketSubject(params: {
    type: string; tbnCode: string; clientName: string; priority: string;
  }): string {
    return `[${params.type}] ${params.tbnCode} — ${params.clientName} (${params.priority})`;
  }

  // PASO 2B (2026-08): firmas ampliadas a TicketMutationResult para cumplir
  // ITicketRepository. NOTA: esta clase no está registrada en app.module.ts
  // (TICKET_REPOSITORY apunta a SistemaApiService) y sus rutas HTTP no
  // coinciden con los endpoints reales del backend (reprogramar/close/reopen
  // vs. reschedule/status) — parece código muerto, no confirmado en uso.
  async rescheduleTicket(ticketId: string, fecha: string, hora: string): Promise<TicketMutationResult> {
    const res = await this.patch<{ TicketNumber?: string | null }>(
      `/api/tickets/${ticketId}/reprogramar`, { Fecha: fecha, Hora: hora },
    );
    return { ticketNumber: res?.TicketNumber ?? null };
  }

  async closeTicket(ticketId: string, resolutionNote?: string): Promise<TicketMutationResult> {
    const res = await this.patch<{ TicketNumber?: string | null }>(
      `/api/tickets/${ticketId}/close`, { ResolutionNote: resolutionNote },
    );
    return { ticketNumber: res?.TicketNumber ?? null };
  }

  async updateTicket(ticketId: string, description: string, rootCause?: string): Promise<TicketMutationResult> {
    const res = await this.patch<{ TicketNumber?: string | null }>(
      `/api/tickets/${ticketId}`, { Description: description, RootCause: rootCause },
    );
    return { ticketNumber: res?.TicketNumber ?? null };
  }

  async getClientActiveTickets(clientId: string): Promise<TicketSummaryDto[]> {
    return this.get(`/api/tickets`, { clientId, status: 'active' });
  }

  async reopenTicket(ticketId: string, reason: string): Promise<TicketMutationResult> {
    const res = await this.patch<{ TicketNumber?: string | null }>(
      `/api/tickets/${ticketId}/reopen`, { Reason: reason },
    );
    return { ticketNumber: res?.TicketNumber ?? null };
  }

  // PASO 16 Fase A (2026-08): agregado solo para cumplir ITicketRepository —
  // misma nota que el resto de la clase, código muerto no confirmado en uso.
  async getRecentTicketCount(clientId: string, type: string, sinceDays?: number): Promise<number> {
    return this.get(`/api/tickets/by-client/${clientId}/recent-count`, { type, sinceDays });
  }

  // PASO 16 Fase C (2026-08): agregado solo para cumplir ITicketRepository —
  // misma nota que el resto de la clase, código muerto no confirmado en uso.
  async getTicketVisitSlots(ticketId: string, diasAdelante?: number): Promise<TicketSlotDto[]> {
    return this.get(`/api/tickets/${ticketId}/visit-slots`, { diasAdelante });
  }

  async scheduleTicketVisit(
    ticketId: string, fecha: string, hora: string, technicianId?: string,
  ): Promise<{ visitId: string; scheduledAt: string }> {
    const scheduledAt = `${fecha}T${hora}:00-04:00`;
    return this.post(`/api/tickets/${ticketId}/visits`, {
      ScheduledAt: scheduledAt,
      ...(technicianId && { TechnicianId: technicianId }),
    });
  }
}
