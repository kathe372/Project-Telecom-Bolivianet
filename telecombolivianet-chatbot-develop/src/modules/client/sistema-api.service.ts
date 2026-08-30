import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  IClientRepository, ITicketRepository, IPlanRepository,
  IInstallationRepository, IPaymentRepository,
  INotificationRepository, IBotConfigRepository,
  InstallationDetailBotDto,
} from './sistema-api.interfaces';
import { ICoverageRepository, CoverageBackendCheck } from '../coverage/coverage.interfaces';
import { isUnpaid } from '../bot/domain/invoice-debt';

import { IRetryPolicy, RETRY_POLICY } from '../../common/resilience/retry-policy.interface';

/** Un telefono puede venir como 59171754388 o 71754388 segun el origen. */
function PhoneNumberLocal(v: string): string {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('591') ? d.slice(3) : d;
}


export interface ClientBotDto {
  Id: string;
  TbnCode: string;
  FullName: string;
  PhoneMain: string;
  Status: string;
  PlanId: string;
  PlanName: string;
  PlanSpeedMbps: number;
  TotalDebt: number;
  PendingMonths: number;
  Zone: string;
}

export interface InvoiceDto {
  Id: string;
  Month: number;
  Year: number;
  Amount: number;
  /** Importe ya abonado. Necesario para el saldo real de una ParcialmentePagada. */
  AmountPaid?: number;
  DueDate: string;
  Status: string;
  PaidAt: string | null;
  /** PASO 5: motivo registrado de un monto no estándar (prorrateo, ajuste manual). */
  Notes?: string | null;
  /** PASO 5: snapshot del plan vigente EN ESA factura, no el plan actual del cliente. */
  PlanName?: string | null;
  PlanPrice?: number | null;
}

export interface PlanDto {
  Id: string;
  Name: string;
  SpeedMbps: number;
  DownloadSpeedMbps: number;
  UploadSpeedMbps: number;
  PriceMonthly: number;
  IsActive: boolean;
}

export interface TicketCreateDto {
  ClientId: string;
  Subject: string;
  Type: string;
  Priority: string;
  Description: string;
  // PASO 6 (2026-08): SlaDurationHours se eliminó a propósito — el chatbot
  // tenía su propia copia hardcodeada de horas de SLA que pisaba en silencio
  // la configuración real del admin (SlaPlansPanel.tsx). El backend siempre
  // calcula el SLA a partir de Priority vía GetDueDateFromSlaAsync — no queda
  // ningún campo acá que permita repetir el mismo error.
  Origin?: string;
  AutoAssign?: boolean;
  ImageUrl?: string;
}

export interface SlotDto {
  Fecha: string;
  HoraInicio: string;
  Disponibles: number;
}

// PASO 16 Fase C: slot de visita técnica de soporte — igual a SlotDto más
// WithinSla (no aplica a instalaciones, sí importa acá: el chatbot debe poder
// avisar si el horario elegido cae antes o después del vencimiento del SLA).
export interface TicketSlotDto {
  Fecha: string;
  HoraInicio: string;
  HoraFin: string;
  Disponibles: number;
  Disponible: boolean;
  WithinSla: boolean;
}

@Injectable()
export class SistemaApiService implements OnModuleInit,
  IClientRepository, ITicketRepository, IPlanRepository,
  IInstallationRepository, IPaymentRepository,
  INotificationRepository, IBotConfigRepository, ICoverageRepository {
  private readonly logger = new Logger(SistemaApiService.name);
  private http: AxiosInstance;
  private token: string | null = null;
  private tokenExpiresAt: Date | null = null;

  getCurrentToken(): string | null {
    return this.token;
  }
  private readonly refreshMarginMs: number;

  constructor(
    private readonly config: ConfigService,
    @Inject(RETRY_POLICY) private readonly retryPolicy: IRetryPolicy,
  ) {
    const marginMin = config.get<number>('sistema.jwtRefreshMarginMinutes') ?? 60;
    this.refreshMarginMs = marginMin * 60 * 1000;
  }

  async onModuleInit() {
    const baseURL = this.config.get<string>('sistema.apiUrl');
    this.http = axios.create({
      baseURL,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.http.interceptors.request.use(async (cfg) => {
      await this.ensureToken();
      if (this.token) {
        cfg.headers['Authorization'] = `Bearer ${this.token}`;
      }
      return cfg;
    });

    this.http.interceptors.response.use(
      (res) => res,
      async (err) => {
        if (err.response?.status === 401 && !err.config?._retried) {
          err.config._retried = true;
          this.logger.warn('JWT rechazado con 401 — renovando token y reintentando...');
          await this.login();
          err.config.headers['Authorization'] = `Bearer ${this.token}`;
          return this.http.request(err.config);
        }
        return Promise.reject(err);
      },
    );

    // P1.1 (auditoría 2026-08): timeout/5xx/corte de conexión del backend C#
    // (ej. cold-restart de Railway) rompía la tool a mitad de conversación
    // sin ningún reintento — mismo problema que tenía el cliente de Gemini
    // antes de esta sesión, pero contra el propio backend. Reutiliza la
    // misma IRetryPolicy (ya sabe distinguir 5xx/timeout de errores 4xx
    // reales de negocio, que NO se reintentan). maxAttempts bajo a propósito
    // — ya aprendimos con Gemini que reintentar de más solo empeora un
    // problema sostenido.
    this.http.interceptors.response.use(
      (res) => res,
      async (err) => {
        if (!err.config || err.config._retriedTransient) return Promise.reject(err);
        err.config._retriedTransient = true;
        try {
          return await this.retryPolicy.execute(
            () => this.http.request(err.config),
            { label: 'sistema-api', maxAttempts: 2, baseMs: 500, capMs: 4000 },
          );
        } catch (finalErr) {
          return Promise.reject(finalErr);
        }
      },
    );

    try {
      await this.login();
    } catch (err) {
      this.logger.warn(`No se pudo conectar al sistema C# al iniciar: ${err.message}`);
    }
  }

  private async login(): Promise<void> {
    const email = this.config.get<string>('sistema.botEmail');
    const password = this.config.get<string>('sistema.botPassword');

    const res = await axios.post(
      `${this.config.get('sistema.apiUrl')}/api/auth/login`,
      { Email: email, Password: password },
    );

    const loginData = res.data.data;
    this.token = loginData?.Token ?? loginData?.token ?? res.data.token;
    this.tokenExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    this.logger.log(`JWT del bot renovado. Expira: ${this.tokenExpiresAt.toISOString()}`);
  }

  private async ensureToken(): Promise<void> {
    if (!this.token || !this.tokenExpiresAt) {
      await this.login();
      return;
    }
    const expiresIn = this.tokenExpiresAt.getTime() - Date.now();
    if (expiresIn <= this.refreshMarginMs) {
      await this.login();
    }
  }

  async getClientByPhone(phone: string): Promise<ClientBotDto | null> {
    try {
      const normalized = phone.startsWith('591') && phone.length > 3
        ? phone.slice(3)
        : phone;

      const res = await this.http.get('/api/clients/by-phone', {
        params: { phone: normalized },
      });
      return res.data.data as ClientBotDto;
    } catch (err) {
      if (err.response?.status === 404) return null;
      this.logger.error(`getClientByPhone error: ${err.message}`);
      throw err;
    }
  }

  async getClientsByPhone(phone: string): Promise<ClientBotDto[]> {
    try {
      const normalized = phone.startsWith('591') && phone.length > 3
        ? phone.slice(3)
        : phone;

      const res = await this.http.get('/api/clients/by-phone-all', {
        params: { phone: normalized },
      });
      return (res.data.data as ClientBotDto[]) ?? [];
    } catch (err) {
      this.logger.error(`getClientsByPhone error: ${err.message}`);
      throw err;
    }
  }

  async getClientInvoices(clientId: string, year?: number): Promise<InvoiceDto[]> {
    const res = await this.http.get(`/api/clients/${clientId}/invoices/bot`, {
      params: { year: year || new Date().getFullYear() },
    });
    return res.data.data?.Invoices || [];
  }

  async getPendingInvoices(clientId: string): Promise<InvoiceDto[]> {
    const invoices = await this.getClientInvoices(clientId);
    return invoices.filter(isUnpaid);
  }

  async getCompanyQrBuffer(): Promise<Buffer> {
    const res = await this.http.get('/api/bot-config/company-qr', {
      responseType: 'arraybuffer',
    });
    return Buffer.from(res.data);
  }

  async getActivePlans(): Promise<PlanDto[]> {
    const res = await this.http.get('/api/plans', {
      params: { onlyActive: true },
    });
    const raw = res.data.data || [];
    return raw.map((p: any) => ({
      Id:                p.Id,
      Name:              p.Name,
      SpeedMbps:         p.SpeedMb,
      DownloadSpeedMbps: p.DownloadSpeedMbps ?? p.SpeedMb,
      UploadSpeedMbps:   p.UploadSpeedMbps ?? p.SpeedMb,
      PriceMonthly:      p.MonthlyPrice,
      IsActive:          p.IsActive,
    }));
  }

  /** FASE G5: GET /api/instalaciones/{id}. Misma politica de autorizacion
   *  (AdminOrTecnico) que cancelar/reprogramar, que el bot ya usa hoy.
   *  404 no es un error: la instalacion pudo purgarse. Devuelve null. */
  async getInstallationById(id: string): Promise<InstallationDetailBotDto | null> {
    try {
      const res = await this.http.get(`/api/instalaciones/${id}`);
      const d = res.data?.data;
      if (!d) return null;
      return {
        Id:            d.Id,
        Fecha:         d.Fecha,
        HoraInicio:    d.HoraInicio,
        HoraFin:       d.HoraFin ?? null,
        Status:        d.Status,
        Direccion:     d.Direccion ?? null,
        PlanNombre:    d.PlanNombre ?? null,
        TecnicoNombre: d.TecnicoNombre ?? null,
      };
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  }

  /** FASE G5: la instalacion vigente del cliente, sin depender de la sesion.
   *  Se ordena por fecha+hora y se toma la primera no cerrada. */
  async findScheduledInstallationId(clientId: string): Promise<string | null> {
    return this.findVigenteId({ clienteId: clientId });
  }

  /** Instalacion vigente por telefono — cubre prospectos y clientes. El
   *  backend indexa el prospecto por ProspectPhone; el cliente, por ClienteId.
   *  Se consulta el listado sin filtro de cliente y se cotejan ambos. */
  async findScheduledInstallationByPhone(phone: string): Promise<string | null> {
    return this.findVigenteId({ telefono: PhoneNumberLocal(phone) });
  }

  /**
   * OBS-04: la instalacion vigente la resuelve AHORA EL BACKEND.
   *
   * Antes se pedia `/api/instalaciones` con PageSize=100 —el listado general, sin
   * filtro— y se cruzaba en memoria contra ProspectPhone y ClientePhone. Es decir:
   * para atender a una persona, el bot leia el nombre, el telefono y la direccion
   * de las ultimas cien que pasaron por la agenda.
   *
   * Era tambien lo que obligaba a que el rol Bot tuviera acceso al listado
   * general de instalaciones, la concesion mas ancha de las que se le dieron.
   * Con este endpoint esa concesion se retiro.
   *
   * 404 = no tiene ninguna vigente. No es un error: es la respuesta.
   */
  private async findVigenteId(
    params: { clienteId?: string; telefono?: string },
  ): Promise<string | null> {
    try {
      const res = await this.http.get('/api/instalaciones/vigente', { params });
      return res.data?.data?.Id ?? null;
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  }

  async getInstallationSlots(diasAdelante = 7, planId?: string): Promise<SlotDto[]> {
    const res = await this.http.get('/api/instalaciones/slots-disponibles', {
      params: { dias: diasAdelante, ...(planId && { planId }) },
    });
    return res.data.data || [];
  }

  async createInstallation(payload: {
    ClienteId: string | null;
    PlanId: string;
    Fecha: string;
    HoraInicio: string;
    Direccion: string;
    Notas?: string;
    GpsLatitude?: number;
    GpsLongitude?: number;
    LocationSource?: string;
    ProspectName?: string;
    ProspectPhone?: string;
    ProspectIdentityCard?: string;
    ProspectBackupPhone?: string;
  }): Promise<{ InstalacionId: string; TicketId: string }> {
    const res = await this.http.post('/api/instalaciones', payload);
    return res.data.data;
  }

  async cancelInstallation(id: string, motivo: string): Promise<void> {
    await this.http.patch(`/api/instalaciones/${id}/cancelar`, {
      MotivoCancelacion: motivo,
      CanceladoPor: 'CLIENTE',
    });
  }

  async rescheduleInstallation(id: string, fecha: string, hora: string, motivo?: string): Promise<void> {
    await this.http.patch(`/api/instalaciones/${id}/reprogramar`, {
      Fecha:      fecha,
      HoraInicio: hora,
      ...(motivo && { Motivo: motivo }),
    });
  }

  async createTicket(
    dto: TicketCreateDto,
  ): Promise<{ Id: string; TicketNumber?: string; DueDate?: string | null }> {
    const res = await this.http.post('/api/tickets', dto);
    // PASO 6: DueDate ya viaja en la respuesta (TicketDetailDto) — antes se
    // descartaba. Es el SLA REAL calculado por el backend a partir de
    // Priority, no un número hardcodeado en el chatbot.
    return res.data.data;
  }

  buildTicketSubject(params: {
    type: string;
    tbnCode: string;
    clientName: string;
    priority: string;
  }): string {
    const typeLabel: Record<string, string> = {
      SoporteTecnico:        'Soporte Técnico',
      InstalacionNueva:      'Instalación Nueva',
      CambioPlan:            'Cambio de Plan',
      RecoleccionEquipo:     'Recolección de Equipo',
      TvCable:               'TV Cable',
      ReactivacionServicio:  'Reactivación de Servicio',
      BajaServicio:          'Baja de Servicio',
    };
    const label = typeLabel[params.type] || params.type;
    const subject = `[${label}] ${params.tbnCode} – ${params.clientName} – ${params.priority}`;
    return subject.slice(0, 200);
  }

  async rescheduleTicket(
    ticketId: string, fecha: string, hora: string,
  ): Promise<import('./sistema-api.interfaces').TicketMutationResult> {
    // El backend combina Fecha (YYYY-MM-DD) + Hora (HH:mm) en hora local de
    // Bolivia y la convierte a UTC; reprograma la visita programada del ticket
    // y notifica al cliente (VISITA_PROGRAMADA).
    const res = await this.http.patch(`/api/tickets/${ticketId}/reschedule`, {
      Fecha: fecha,
      Hora:  hora,
    });
    // PASO 2B: el backend ya devuelve TicketVisitDto.TicketNumber — antes se descartaba.
    return { ticketNumber: res.data?.data?.TicketNumber ?? null };
  }

  async closeTicket(
    ticketId: string, resolutionNote?: string,
  ): Promise<import('./sistema-api.interfaces').TicketMutationResult> {
    const res = await this.http.patch(`/api/tickets/${ticketId}/status`, {
      Status: 'Resuelto',
      ...(resolutionNote && { ResolutionMessage: resolutionNote }),
    });
    return { ticketNumber: res.data?.data?.TicketNumber ?? null };
  }

  async updateTicket(
    ticketId: string, description: string, rootCause?: string,
  ): Promise<import('./sistema-api.interfaces').TicketMutationResult> {
    const res = await this.http.put(`/api/tickets/${ticketId}`, {
      ...(description && { Description: description }),
      ...(rootCause   && { RootCause:   rootCause   }),
      Priority: null,
    });
    return { ticketNumber: res.data?.data?.TicketNumber ?? null };
  }

  async getClientActiveTickets(clientId: string): Promise<import('./sistema-api.interfaces').TicketSummaryDto[]> {
    try {
      const res  = await this.http.get(`/api/tickets/by-client/${clientId}`);
      const all: any[] = res.data.data ?? [];

      return all
        .filter(t => t.Status !== 'Cerrado')
        .slice(0, 5)
        .map(t => ({
          Id:             t.Id,
          TicketNumber:   t.TicketNumber ?? null,
          Subject:        t.Subject,
          Status:         t.Status,
          Priority:       t.Priority,
          Type:           t.Type,
          CreatedAt:      t.CreatedAt,
          AssignedToName: t.AssignedToName ?? null,
          SlaDeadline:    t.SlaDeadline ?? t.DueDate ?? null,
          SlaCompliant:   t.SlaCompliant ?? null,
        }));
    } catch (err: any) {
      if (err.response?.status === 404) return [];
      this.logger.error(`getClientActiveTickets error: ${err.message}`);
      throw err;
    }
  }

  async getRecentTicketCount(clientId: string, type: string, sinceDays = 0): Promise<number> {
    try {
      const res = await this.http.get(`/api/tickets/by-client/${clientId}/recent-count`, {
        params: { type, ...(sinceDays > 0 && { sinceDays }) },
      });
      return Number(res.data?.data ?? 0);
    } catch (err: any) {
      this.logger.error(`getRecentTicketCount error: ${err.message}`);
      // PASO 16 Fase A: si el conteo falla, se asume no-recurrente (0) — nunca
      // bloquear el flujo normal de soporte por un fallo de esta consulta.
      return 0;
    }
  }

  // PASO 16 Fase C: slots disponibles para agendar una visita técnica sobre un
  // ticket ya abierto — mismo shape que getInstallationSlots pero con WithinSla.
  async getTicketVisitSlots(ticketId: string, diasAdelante = 5): Promise<TicketSlotDto[]> {
    const res = await this.http.get(`/api/tickets/${ticketId}/visit-slots`, {
      params: { diasAdelante },
    });
    return res.data.data || [];
  }

  async scheduleTicketVisit(
    ticketId: string, fecha: string, hora: string, technicianId?: string,
  ): Promise<{ visitId: string; scheduledAt: string }> {
    // Bolivia tiene offset fijo UTC-4 (sin horario de verano) — el backend
    // guarda ScheduledAt tal cual llega, sin volver a convertir zona horaria
    // (a diferencia de reschedule, que sí recibe Fecha/Hora sueltos y convierte
    // él mismo). Por eso acá se arma el offset explícito antes de enviarlo.
    const scheduledAt = `${fecha}T${hora}:00-04:00`;
    const res = await this.http.post(`/api/tickets/${ticketId}/visits`, {
      ScheduledAt: scheduledAt,
      ...(technicianId && { TechnicianId: technicianId }),
    });
    return {
      visitId:     res.data?.data?.Id ?? '',
      scheduledAt: res.data?.data?.ScheduledAt ?? scheduledAt,
    };
  }

  async reopenTicket(
    ticketId: string, reason: string,
  ): Promise<import('./sistema-api.interfaces').TicketMutationResult> {
    const note = `Reabierto por el cliente via WhatsApp: ${reason}`.slice(0, 1900);
    const res = await this.http.patch(`/api/tickets/${ticketId}/status`, {
      Status:            'EnProceso',
      ResolutionMessage: note,
    });
    return { ticketNumber: res.data?.data?.TicketNumber ?? null };
  }

  async postDeliveryStatus(waMessageId: string, status: string, timestamp: string): Promise<void> {
    try {
      await this.http.post('/api/notifications/delivery-status', {
        WaMessageId: waMessageId,
        Status: status,
        Timestamp: parseInt(timestamp, 10),
      });
    } catch (err) {
      this.logger.warn(`postDeliveryStatus error wamid=${waMessageId}: ${err.message}`);
    }
  }

  async requestPlanChange(
    clientId: string,
    newPlanId: string,
    notes?: string,
  ): Promise<{ changeId: string }> {
    const res = await this.http.post(`/api/clients/${clientId}/plan-change`, {
      NewPlanId: newPlanId,
      Notes:     notes ?? null,
    });
    return { changeId: res.data.data.ChangeId };
  }

  async getBotConfigPublic(): Promise<any> {
    const res = await this.http.get('/api/bot-config/public');
    return res.data?.data ?? null;
  }

  async checkCoverage(lat: number, lng: number): Promise<CoverageBackendCheck> {
    try {
      const res  = await this.http.get('/api/coverage/check', { params: { lat, lng } });
      const data = res.data?.data ?? res.data;
      const outcome = ((data?.outcome ?? data?.Outcome) as string | undefined)?.toUpperCase();
      const zoneName         = (data?.zoneName ?? data?.ZoneName ?? null) as string | null;
      const escalationReason = (data?.escalationReason ?? data?.EscalationReason ?? null) as string | null;

      if (outcome) {
        if (outcome === 'CONFIRMED') return { covered: true, zoneName };
        if (outcome === 'NOCOVERAGE' || outcome === 'NO_COVERAGE') return { covered: false, zoneName };
        return { covered: null, zoneName, escalationReason };
      }
      if (data?.hasCoverage !== undefined) return { covered: Boolean(data.hasCoverage) };
      return { covered: null };
    } catch (err: any) {
      if (err.response?.status === 404) return { covered: null };
      this.logger.error(`checkCoverage error: ${err.message}`);
      throw err;
    }
  }
}
