import { formatBsAmount } from '@/utils/currency';

export const fmtBs = (v?: number | null): string =>
  v == null ? '—' : `Bs ${formatBsAmount(v)}`;

export const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' }) : '—';

export const fmtDateLong = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
