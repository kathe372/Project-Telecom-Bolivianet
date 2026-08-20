import api from './api';
import type { ApiResponse } from '@/types/auth.types';

export interface DashboardKpisDto {
  ClientesActivos: number; ClientesSuspendidos: number; ClientesNuevosMes: number;
  CobradoEsteMes: number; CobradoMesAnterior: number;
  ClientesConDeuda: number; MontoDeudaTotal: number;
  TicketsAbiertos: number; TicketsCriticos: number;
  TicketsResueltosHoy: number; TicketsSlaVencidos: number;
  ComprobantesPendientes: number; MensajesWspHoy: number;
  Arpu: number;
  ClientesCanceladosMes: number;
}
export interface TendenciaMes { Mes: string; MesCompleto: string; Total: number; Cantidad: number; }
export interface CollectionsTrendDto { Meses: TendenciaMes[]; }
export interface TicketEstadoDashDto { Estado: string; Total: number; Criticos: number; }
export interface TicketDashItemDto {
  Id: string; ClienteNombre: string; Asunto: string;
  Tipo: string; Prioridad: string; Estado: string; Tecnico: string;
  CreadoEn: string; FechaLimite: string | null; SlaVencido: boolean;
}
export interface TicketPorTipoDto { Tipo: string; Total: number; }
export interface ResolucionPromDto { Prioridad: string; HorasPromedio: number; Cantidad: number; }
export interface DebtorItem { ClienteId: string; ClienteNombre: string; Zona: string; MontoDeuda: number; DiasVencido: number; FacturasVencidas: number; }
export interface RecentReceipt { Id: string; ClienteNombre: string; Monto: number; FechaPago: string; Estado: string; Metodo: string; }

export interface DashNotifPorTipoDto { NotifTipo: string; Enviadas: number; Fallidas: number; Pendientes: number; }
export interface DashNotifDto {
  EnviadasUlt24h: number; FallidasUlt24h: number; PendientesEnCola: number;
  OmitidosAntispam: number; TasaExitoUlt24h: number;
  PorTipo: DashNotifPorTipoDto[];
}

export interface AgingBucketDto { Rango: string; FacturasCount: number; MontoTotal: number; ClientesCount: number; }
export interface AgingPortfolioDto { TotalCartera: number; TotalFacturas: number; Buckets: AgingBucketDto[]; }

export interface TechnicianWorkloadDto { TecnicoNombre: string; TicketsActivos: number; TicketsCriticos: number; TicketsEnVisita: number; PromedioHorasAbierto: number; }
export interface TechniciansWorkloadDto { TotalSinAsignar: number; Tecnicos: TechnicianWorkloadDto[]; }

export interface DashChatbotIntencionDto { Intencion: string; Ocurrencias: number; PctTotal: number; }
export interface DashChatbotDto {
  ConversacionesActivas: number; ConversacionesHoy: number; ConversacionesMes: number;
  TasaResolucionBot: number; TasaEscaladoHumano: number;
  IntencionesFrecuentes: DashChatbotIntencionDto[];
  IsAvailable: boolean;
}

export interface DashAutoActionItemDto { Accion: string; Detalle: string; OcurridoAt: string; AreaModulo: string; }
export interface DashAutoActionsDto {
  SuspensionesHoy: number; ReactivacionesHoy: number; FacturasEmitidasHoy: number;
  RecordatoriosEnviadosHoy: number; FacturasVencidasMarcadasHoy: number;
  Recientes: DashAutoActionItemDto[];
}

export interface ClientUpcomingCutoffDto { ClienteId: string; ClienteNombre: string; Zona: string; MontoDeuda: number; DiasParaCorte: number; EstadoFactura: string; }
export interface UpcomingCutoffsDto { Total: number; Clientes: ClientUpcomingCutoffDto[]; }

export interface DashboardPreferences {
  ShowKpis: boolean; ShowTendencia: boolean; ShowTickets: boolean; ShowWhatsApp: boolean;
  ShowDeudores: boolean; ShowZonas: boolean; ShowMetodosPago: boolean; ShowComprobantes: boolean;
}

export const DEFAULT_PREFERENCES: DashboardPreferences = {
  ShowKpis: true, ShowTendencia: true, ShowTickets: true, ShowWhatsApp: true,
  ShowDeudores: true, ShowZonas: true, ShowMetodosPago: true, ShowComprobantes: true,
};

const g = <T>(url: string, params?: object) =>
  api.get<ApiResponse<T>>(url, params ? { params } : undefined).then(r => r.data.data!);

export const dashboardService = {
  getKpis:                 ()          => g<DashboardKpisDto>('/dashboard/kpis'),
  getCollectionsTrend:      (meses = 6) => g<CollectionsTrendDto>('/dashboard/tendencia-cobros', { meses }),
  getTicketsEstado:        ()          => g<TicketEstadoDashDto[]>('/dashboard/tickets-estado'),
  getTicketsUrgentes:      ()          => g<TicketDashItemDto[]>('/dashboard/tickets-urgentes'),
  getTicketsPorTipo:       ()          => g<TicketPorTipoDto[]>('/dashboard/tickets-por-tipo'),
  getResolucionPromedio:   ()          => g<ResolucionPromDto[]>('/dashboard/resolucion-promedio'),
  getDebtors:             ()          => g<DebtorItem[]>('/dashboard/deudores'),
  getRecentReceipts:()          => g<RecentReceipt[]>('/dashboard/comprobantes-recientes'),
  getPreferences: async (userId: string): Promise<DashboardPreferences> => {
    try { return await g<DashboardPreferences>(`/dashboard/preferences/${userId}`); }
    catch { return DEFAULT_PREFERENCES; }
  },
  savePreferences: (userId: string, prefs: DashboardPreferences) =>
    api.put(`/dashboard/preferences/${userId}`, prefs),
  getDashChatbotKpis:    () => g<DashChatbotDto>('/dashboard/chatbot-kpis'),
  getDashAutoActions:    () => g<DashAutoActionsDto>('/dashboard/auto-actions'),
  getProximosCorte:      (dias = 7)   => g<UpcomingCutoffsDto>('/dashboard/proximos-corte', { dias }),
  getDashNotifStats:     () => g<DashNotifDto>('/dashboard/notif-stats'),
  getAgingCartera:       ()           => g<AgingPortfolioDto>('/dashboard/aging-cartera'),
  getWorkloadTecnicos:   ()           => g<TechniciansWorkloadDto>('/dashboard/workload-tecnicos'),
};
