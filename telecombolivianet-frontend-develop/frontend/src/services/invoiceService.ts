import api from './api';
import type {
  InvoiceMonthStatsDto,
  InvoiceRangeStatsDto,
  InvoiceDetailDto,
  BillingJobResultDto,
  BillingPreviewDto,
  AnnualReportRowDto,
  DebtorDto,
} from '@/types/invoice.types';
import type { PagedResult, ApiResponse } from '@/types/auth.types';

/** Tipos de factura que ofrece el selector. 'all' = todas. */
export const INVOICE_TYPES = [
  { value: 'all',            label: 'Todas'            },
  { value: 'Mensualidad',    label: 'Mensualidades'    },
  { value: 'Extraordinaria', label: 'Extraordinarias'  },
  { value: 'Instalacion',    label: 'Instalación'      },
  { value: 'ProrrataAnterior', label: 'Prorrata anterior' },
  { value: 'ProrrataNueva',    label: 'Prorrata nueva'    },
] as const;

export type InvoiceTypeFilter = (typeof INVOICE_TYPES)[number]['value'];

export interface InvoiceFilter {
  year?:      number;
  month?:     number;
  status?:    string;
  search?:    string;
  dateFrom?:  string;
  dateTo?:    string;
  pageNumber?: number;
  pageSize?:   number;
  /** Sin valor o 'all' → todas. Antes el backend forzaba Mensualidad y las facturas
   *  extraordinarias y de instalación no aparecían en la pantalla ni en los totales. */
  type?:      InvoiceTypeFilter;
}

export const invoiceService = {
  getStats: async (
    year: number, month: number, type?: InvoiceTypeFilter,
  ): Promise<InvoiceMonthStatsDto> => {
    const res = await api.get<ApiResponse<InvoiceMonthStatsDto>>(
      '/invoices/stats', { params: { year, month, type } });
    return res.data.data!;
  },

  getStatsRange: async (
    dateFrom: string, dateTo: string, type?: InvoiceTypeFilter,
  ): Promise<InvoiceRangeStatsDto> => {
    const res = await api.get<ApiResponse<InvoiceRangeStatsDto>>(
      '/invoices/stats/range', { params: { dateFrom, dateTo, type } });
    return res.data.data!;
  },

  getAll: async (filter: InvoiceFilter): Promise<PagedResult<InvoiceDetailDto>> => {
    const res = await api.get<ApiResponse<PagedResult<InvoiceDetailDto>>>(
      '/invoices', { params: filter });
    return res.data.data!;
  },

  getBillingPreview: async (year: number, month: number): Promise<BillingPreviewDto> => {
    const res = await api.get<ApiResponse<BillingPreviewDto>>(
      '/invoices/billing-preview', { params: { year, month } });
    return res.data.data!;
  },

  generateManual: async (year: number, month: number): Promise<BillingJobResultDto> => {
    const res = await api.post<ApiResponse<BillingJobResultDto>>(
      '/invoices/generate', null, { params: { year, month } });
    return res.data.data!;
  },

  markOverdue: async (): Promise<number> => {
    const res = await api.post<ApiResponse<{ MarkedOverdue: number }>>('/invoices/mark-overdue');
    return res.data.data!.MarkedOverdue;
  },

  voidInvoice: async (id: string, justification: string): Promise<void> => {
    await api.put(`/invoices/${id}/void`, { Justification: justification });
  },

  getDebtors: async (search?: string, from?: string, to?: string): Promise<DebtorDto[]> => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (from)   params.from   = from;
    if (to)     params.to     = to;
    const res = await api.get<ApiResponse<DebtorDto[]>>('/invoices/deudores', { params });
    return res.data.data!;
  },

  getAnnualReport: async (params: {
    year: number; zone?: string; planId?: string;
    debtFilter?: string; sortBy?: string; search?: string;
  }): Promise<AnnualReportRowDto[]> => {
    const res = await api.get<ApiResponse<AnnualReportRowDto[]>>(
      '/invoices/annual-report', { params });
    return res.data.data!;
  },

  exportExcel: (year: number, month: number, filters?: InvoiceExportFilters): Promise<void> =>
    downloadReport('/invoices/export/excel',
      { year, month, ...cleanFilters(filters) },
      `Facturas_${year}_${String(month).padStart(2, '0')}.xlsx`, XLSX_MIME),

  exportPdf: (year: number, month: number, filters?: InvoiceExportFilters): Promise<void> =>
    downloadReport('/invoices/export/pdf',
      { year, month, ...cleanFilters(filters) },
      `Facturas_${year}_${String(month).padStart(2, '0')}.pdf`, 'application/pdf'),

  exportAnnualExcel: (params: AnnualExportParams): Promise<void> =>
    downloadReport('/invoices/annual-report/export/excel', params,
      `ReporteAnual_${params.year}.xlsx`, XLSX_MIME),

  exportAnnualPdf: (params: AnnualExportParams): Promise<void> =>
    downloadReport('/invoices/annual-report/export/pdf', params,
      `ReporteAnual_${params.year}.pdf`, 'application/pdf'),

};

/** Filtros de la pantalla que el archivo exportado debe respetar. */
export interface InvoiceExportFilters {
  type?:   string;
  status?: string;
  search?: string;
}

export interface AnnualExportParams {
  year:        number;
  zone?:       string;
  planId?:     string;
  debtFilter?: string;
  search?:     string;
}

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 'all' y las cadenas vacías no son filtros: enviarlos ensucia el membrete del reporte. */
function cleanFilters(filters?: InvoiceExportFilters): InvoiceExportFilters {
  if (!filters) return {};
  return Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v && v !== 'all'),
  );
}

async function downloadReport(
  url: string,
  params: object,
  filename: string,
  mime: string,
): Promise<void> {
  const res = await api.get(url, { params, responseType: 'blob' });

  const objectUrl = URL.createObjectURL(new Blob([res.data as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href     = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}


export type InvoiceStatus =
  | 'Pendiente' | 'Pagada' | 'Vencida' | 'Anulada'
  | 'Emitida' | 'Enviada' | 'ParcialmentePagada';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  Emitida:            'Emitida',
  Enviada:            'Enviada',
  Pendiente:          'Pendiente',
  Vencida:            'Vencida',
  ParcialmentePagada: 'Pago Parcial',
  Pagada:             'Pagada',
  Anulada:            'Anulada',
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  Emitida:            'bg-blue-50 text-blue-700 border-blue-200',
  Enviada:            'bg-indigo-50 text-indigo-700 border-indigo-200',
  Pendiente:          'bg-yellow-50 text-yellow-700 border-yellow-200',
  Vencida:            'bg-red-50 text-red-700 border-red-200',
  ParcialmentePagada: 'bg-orange-50 text-orange-700 border-orange-200',
  Pagada:             'bg-green-50 text-green-700 border-green-200',
  Anulada:            'bg-gray-100 text-gray-500 border-gray-200',
};


export const MOTIVOS_EXTRAORDINARIOS = [
  'Reconexion', 'Equipo', 'VisitaTecnica', 'Instalacion', 'Otro',
] as const;
export type ExtraordinaryReason = typeof MOTIVOS_EXTRAORDINARIOS[number];

export const MOTIVO_LABELS: Record<ExtraordinaryReason, string> = {
  Reconexion:    'Reconexión',
  Equipo:        'Equipo / Hardware',
  VisitaTecnica: 'Visita Técnica',
  Instalacion:   'Instalación',
  Otro:          'Otro',
};

export interface InvoiceM3ListItem {
  Id: string;
  InvoiceNumber: string;
  ClientId: string;
  TbnCode: string;
  ClientName: string;
  Type: string;
  Status: InvoiceStatus;
  Year: number;
  Month: number;
  Amount: number;
  AmountPaid: number;
  CreditApplied: number;
  IssuedAt: string;
  DueDate: string;
  UpdatedAt: string | null;
  Notes: string | null;
  IsExtraordinary: boolean;
  ExtraordinaryReason: string | null;
}


export const createExtraordinaryInvoice = async (dto: {
  ClientId: string;
  Amount: number;
  Motivo: string;
  DueDate: string;
  Notes?: string;
}): Promise<InvoiceM3ListItem> => {
  const res = await api.post('/invoices/extraordinary', dto);
  return res.data.data;
};


