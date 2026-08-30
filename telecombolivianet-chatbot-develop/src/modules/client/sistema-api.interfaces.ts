import {
  ClientBotDto, InvoiceDto, PlanDto,
  TicketCreateDto, SlotDto, TicketSlotDto,
} from './sistema-api.service';

export const CLIENT_REPOSITORY       = Symbol('CLIENT_REPOSITORY');
export const TICKET_REPOSITORY       = Symbol('TICKET_REPOSITORY');
export const PLAN_REPOSITORY         = Symbol('PLAN_REPOSITORY');
export const INSTALLATION_REPOSITORY = Symbol('INSTALLATION_REPOSITORY');
export const PAYMENT_REPOSITORY      = Symbol('PAYMENT_REPOSITORY');
export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');
export const BOT_CONFIG_REPOSITORY   = Symbol('BOT_CONFIG_REPOSITORY');


export interface IClientRepository {
  getClientByPhone(phone: string): Promise<ClientBotDto | null>;
  /** 2026-08-05: variante que devuelve TODAS las cuentas que comparten ese
   *  teléfono (PhoneMain no es único) — para detectar ambigüedad en vez de
   *  elegir una arbitrariamente. */
  getClientsByPhone(phone: string): Promise<ClientBotDto[]>;
  getClientInvoices(clientId: string, year?: number): Promise<InvoiceDto[]>;
  getPendingInvoices(clientId: string): Promise<InvoiceDto[]>;
  requestPlanChange(clientId: string, newPlanId: string, notes?: string): Promise<{ changeId: string }>;
}

export interface TicketSummaryDto {
  Id:             string;
  TicketNumber:   string | null;
  Subject:        string;
  Status:         string;
  Priority:       string;
  Type:           string;
  CreatedAt:      string;
  AssignedToName: string | null;
  SlaDeadline:    string | null;
  SlaCompliant:   boolean | null;
}

/** PASO 2B: antes Promise<void> — descartaba el TicketNumber que el backend ya devuelve. */
export interface TicketMutationResult {
  ticketNumber?: string | null;
}

export interface ITicketRepository {
  createTicket(dto: TicketCreateDto): Promise<{ Id: string; TicketNumber?: string; DueDate?: string | null }>;
  buildTicketSubject(params: { type: string; tbnCode: string; clientName: string; priority: string }): string;
  rescheduleTicket(ticketId: string, fecha: string, hora: string): Promise<TicketMutationResult>;
  closeTicket(ticketId: string, resolutionNote?: string): Promise<TicketMutationResult>;
  /** D-26: la calificacion del cliente, en su propia columna. */
  recordCsat(ticketId: string, score: number): Promise<void>;
  updateTicket(ticketId: string, description: string, rootCause?: string): Promise<TicketMutationResult>;
  getClientActiveTickets(clientId: string): Promise<TicketSummaryDto[]>;
  reopenTicket(ticketId: string, reason: string): Promise<TicketMutationResult>;
  /** PASO 16 Fase A: cuenta tickets previos del mismo tipo, en una ventana de
   *  días — usado para detectar reclamos recurrentes. sinceDays<=0 usa el
   *  default configurado en el backend (SystemConfig). */
  getRecentTicketCount(clientId: string, type: string, sinceDays?: number): Promise<number>;
  /** PASO 16 Fase C: slots disponibles para agendar una visita técnica sobre un ticket. */
  getTicketVisitSlots(ticketId: string, diasAdelante?: number): Promise<TicketSlotDto[]>;
  /** PASO 16 Fase C: agenda la visita — fecha/hora en hora local de Bolivia (YYYY-MM-DD / HH:mm). */
  scheduleTicketVisit(
    ticketId: string, fecha: string, hora: string, technicianId?: string,
  ): Promise<{ visitId: string; scheduledAt: string }>;
}

export interface IPlanRepository {
  getActivePlans(): Promise<PlanDto[]>;
}

/** FASE G5 (2026-08-07): subconjunto de InstallationDetailDto del backend que
 *  el bot necesita para responder "¿a que hora vienen a instalarme?". */
export interface InstallationDetailBotDto {
  Id:             string;
  Fecha:          string;
  HoraInicio:     string;
  HoraFin:        string | null;
  Status:         string;
  Direccion:      string | null;
  PlanNombre:     string | null;
  TecnicoNombre:  string | null;
}

export interface IInstallationRepository {
  /** FASE G5: la cita real. Sin esto el modelo caia en get_active_ticket y
   *  narraba el vencimiento del SLA como si fuera la hora de la visita. */
  getInstallationById(id: string): Promise<InstallationDetailBotDto | null>;
  /** FASE G5: fallback cuando la sesion de Redis ya expiro (el caso tipico:
   *  el cliente vuelve al dia siguiente a preguntar por su cita). Devuelve el
   *  id de la instalacion vigente del cliente, o null. */
  findScheduledInstallationId(clientId: string): Promise<string | null>;
  /** Busca por TELEFONO, que es lo unico que se tiene de un prospecto.
   *  Sin esto el chatbot es ciego a las instalaciones de quien todavia no es
   *  cliente: le decia "no tenes ninguna agendada" a alguien que si la tenia,
   *  y el duplicado recien aparecia al intentar crearla. */
  findScheduledInstallationByPhone(phone: string): Promise<string | null>;
  getInstallationSlots(diasAdelante?: number, planId?: string): Promise<SlotDto[]>;
  createInstallation(payload: {
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
  }): Promise<{ InstalacionId: string; TicketId: string }>;
  cancelInstallation(id: string, motivo: string): Promise<void>;
  rescheduleInstallation(id: string, fecha: string, hora: string, motivo?: string): Promise<void>;
}

export interface IPaymentRepository {
  getCompanyQrBuffer(): Promise<Buffer>;
}

export interface INotificationRepository {
  getCurrentToken(): string | null;
  postDeliveryStatus(waMessageId: string, status: string, timestamp: string): Promise<void>;
}

export interface IBotConfigRepository {
  getBotConfigPublic(): Promise<any>;
}
