import api from './api';
import type {
  PaymentListItemDto, PaymentDetailDto, PaymentFilterDto,
  DuplicateCheckResultDto,
  CollectionReportDto, ReminderJobResultDto,
} from '@/types/payment.types';
import type { PagedResult, ApiResponse } from '@/types/auth.types';

export const paymentService = {
  getAll: async (filter: PaymentFilterDto = {}): Promise<PagedResult<PaymentListItemDto>> => {
    const res = await api.get<ApiResponse<PagedResult<PaymentListItemDto>>>(
      '/payments', { params: filter });
    return res.data.data!;
  },

  getById: async (id: string): Promise<PaymentDetailDto> => {
    const res = await api.get<ApiResponse<PaymentDetailDto>>(`/payments/${id}`);
    return res.data.data!;
  },

  uploadReceiptImage: async (paymentId: string, file: File): Promise<string> => {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<ApiResponse<{ Url: string }>>(
      `/payments/${paymentId}/receipt-image`, form,
      { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data.data!.Url;
  },

  voidPayment: async (id: string, justification: string) => {
    const res = await api.put<ApiResponse<{ InvoicesReverted: number; Message: string }>>(
      `/payments/${id}/void`, { Justification: justification });
    return res.data.data!;
  },

  getCollectionReport: async (from: string, to: string): Promise<CollectionReportDto> => {
    const res = await api.get<ApiResponse<CollectionReportDto>>(
      '/payments/collection-report', { params: { from, to } });
    return res.data.data!;
  },

  checkDuplicate: async (
    clientId: string, amount: number, paidAt: string
  ): Promise<DuplicateCheckResultDto> => {
    const res = await api.get<ApiResponse<DuplicateCheckResultDto>>(
      '/payments/check-duplicate', { params: { clientId, amount, paidAt } });
    return res.data.data!;
  },

  sendReminders: async (): Promise<ReminderJobResultDto> => {
    const res = await api.post<ApiResponse<ReminderJobResultDto>>('/payments/send-reminders');
    return res.data.data!;
  },
};


export interface CashCloseChannelDetail {
  Method: string;
  Cantidad: number;
  Monto: number;
}

export interface CashCloseDto {
  Id: string;
  UserId: string;
  OperatorName: string;
  StartedAt: string;
  ClosedAt: string | null;
  TotalAmount: number;
  PagosValidados: number;
  PagosRechazados: number;
  Detalle: CashCloseChannelDetail[];
  IsClosed: boolean;
  PdfPath: string | null;
}

export interface PaymentRegisteredDto {
  PaymentId: string;
  ReceiptNumber: string;
  AmountPaid: number;
  CreditGenerated: number;
  CreditUsed: number;
  Message: string;
}

export interface CollectionReportByOperatorDto {
  From: string;
  To: string;
  TotalAmount: number;
  Count: number;
  OperatorName: string | null;
  Payments: PaymentReportRow[];
  Operators: { Id: string; Name: string }[];
}

export interface PaymentReportRow {
  Id: string;
  TbnCode: string;
  ClientName: string;
  Amount: number;
  Method: string;
  Bank: string | null;
  PaidAt: string;
  OperatorName: string;
  PhysicalReceiptNumber: string | null;
  FromWhatsApp: boolean;
}


export const registerPaymentWithCredit = async (dto: {
  ClientId: string;
  Amount: number;
  Method: string;
  Bank?: string;
  PaidAt: string;
  InvoiceIds: string[];
  PhysicalReceiptNumber?: string;
  BankReference?: string;
}): Promise<PaymentRegisteredDto> => {
  const res = await api.post('/payments/register-with-credit', dto);
  return res.data.data;
};


export const getActiveTurno = async (): Promise<CashCloseDto> => {
  const res = await api.get('/payments/cash-close/active');
  return res.data.data;
};

export const cerrarTurno = async (): Promise<CashCloseDto> => {
  const res = await api.post('/payments/cash-close/close');
  return res.data.data;
};

export const getCashCloses = async (
  operatorId?: string, desde?: string, hasta?: string
): Promise<CashCloseDto[]> => {
  const params: Record<string, string> = {};
  if (operatorId) params.operatorId = operatorId;
  if (desde)      params.desde      = desde;
  if (hasta)      params.hasta      = hasta;
  const res = await api.get('/payments/cash-close', { params });
  return res.data.data;
};


