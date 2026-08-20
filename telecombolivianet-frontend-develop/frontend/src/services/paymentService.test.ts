import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('./api', () => ({
  default: {
    get:    vi.fn(),
    put:    vi.fn(),
    post:   vi.fn(),
    patch:  vi.fn(),
    delete: vi.fn(),
  },
}));

import api from './api';
import { paymentService } from './paymentService';


const PAYMENT_ITEM = {
  Id:       'pago-uuid-001',
  ClientId: 'uuid-001',
  Amount:   150,
  PaidAt:   '2026-04-01T08:00:00Z',
  Method:   'Transferencia',
  Status:   'Activo',
};

const PAGED_PAYMENTS = {
  Items:       [PAYMENT_ITEM],
  TotalCount:  1,
  PageNumber:  1,
  PageSize:    20,
  TotalPages:  1,
  HasPreviousPage: false,
  HasNextPage:     false,
};

describe('paymentService.getAll', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-PAY-FE-01 — llama GET /payments sin filtros', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: PAGED_PAYMENTS } });

    await paymentService.getAll({});

    expect(api.get).toHaveBeenCalledWith('/payments', { params: {} });
  });

  it('TC-PAY-FE-02 — pasa filtros de fecha como params', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: PAGED_PAYMENTS } });

    await paymentService.getAll({ from: '2026-04-01', to: '2026-04-30' });

    expect(api.get).toHaveBeenCalledWith('/payments', {
      params: { from: '2026-04-01', to: '2026-04-30' },
    });
  });

  it('TC-PAY-FE-03 — retorna el resultado paginado', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: PAGED_PAYMENTS } });

    const result = await paymentService.getAll({});

    expect(result.TotalCount).toBe(1);
    expect(result.Items[0].Id).toBe('pago-uuid-001');
  });
});


describe('paymentService.getById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-PAY-FE-04 — llama GET /payments/:id', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: PAYMENT_ITEM } });

    await paymentService.getById('pago-uuid-001');

    expect(api.get).toHaveBeenCalledWith('/payments/pago-uuid-001');
  });
});


describe('paymentService.voidPayment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-PAY-FE-05 — llama PUT /payments/:id/void con Justification en PascalCase', async () => {
    (api.put as Mock).mockResolvedValueOnce({ data: { data: { InvoicesReverted: 1, Message: 'OK' } } });

    await paymentService.voidPayment('pago-uuid-001', 'Pago duplicado');

    expect(api.put).toHaveBeenCalledWith(
      '/payments/pago-uuid-001/void',
      { Justification: 'Pago duplicado' },
    );
  });
});


describe('paymentService.checkDuplicate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-PAY-FE-06 — llama GET /payments/check-duplicate con los params correctos', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: { isDuplicate: false } } });

    await paymentService.checkDuplicate('uuid-001', 150, '2026-04-27');

    expect(api.get).toHaveBeenCalledWith('/payments/check-duplicate', {
      params: { clientId: 'uuid-001', amount: 150, paidAt: '2026-04-27' },
    });
  });
});
