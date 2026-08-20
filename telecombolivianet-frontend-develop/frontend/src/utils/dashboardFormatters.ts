import { formatBsAmount } from '@/utils/currency';

export const fmtBs = (v?: number) =>
  v == null ? '—' : `Bs ${formatBsAmount(v)}`;

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' }) : '—';

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

export const pctChange = (now: number, prev: number) =>
  prev === 0 ? null : Math.round(((now - prev) / prev) * 100);

export const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const PRIO_BADGE: Record<string, string> = {
  Critica: 'bg-red-600 text-white', Alta: 'bg-orange-500 text-white',
  Media: 'bg-yellow-400 text-gray-900', Baja: 'bg-gray-200 text-gray-700',
};
export const STATUS_BADGE: Record<string, string> = {
  Abierto: 'text-blue-700 bg-blue-50', EnProceso: 'text-orange-700 bg-orange-50',
  Resuelto: 'text-green-700 bg-green-50', Cerrado: 'text-gray-500 bg-gray-100',
};
export const ESTADO_DOT: Record<string, string> = {
  Abierto: '#3b82f6', EnProceso: '#f97316', Resuelto: '#22c55e', Cerrado: '#9ca3af',
};
export const TIPO_COLOR: Record<string, string> = {
  SoporteTecnico: '#3b82f6', InstalacionNueva: '#22c55e', CambioPlan: '#f59e0b',
  TvCable: '#8b5cf6', ReactivacionServicio: '#06b6d4',
  BajaServicio: '#ef4444', RecoleccionEquipo: '#6b7280',
};
export const METODO_COLOR: Record<string, string> = {
  Efectivo: '#22c55e', DepositoBancario: '#3b82f6', QR: '#f59e0b',
};
export const WSP_BADGE: Record<string, string> = {
  Pendiente: 'text-amber-700 bg-amber-50', Aprobado: 'text-green-700 bg-green-50',
  Rechazado: 'text-red-700 bg-red-50',
};
