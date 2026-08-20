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
import { clientService } from './clientService';


const CLIENT_LIST_ITEM = {
  Id:           'uuid-001',
  TbnCode:      'TBN-001',
  FullName:     'Juan Mamani',
  Zone:         'Norte',
  PhoneMain:    '59170000001',
  PlanName:     'Plan Plata',
  HasTvCable:   false,
  Status:       'Activo',
  TotalDebt:    0,
  PendingMonths: 0,
};

const PAGED_RESULT = {
  Items:       [CLIENT_LIST_ITEM],
  TotalCount:  1,
  PageNumber:  1,
  PageSize:    20,
  TotalPages:  1,
  HasPreviousPage: false,
  HasNextPage:     false,
};


describe('clientService.getAll', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-CLI-FE-01 — llama GET /clients sin filtros', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: PAGED_RESULT } });

    await clientService.getAll();

    expect(api.get).toHaveBeenCalledWith('/clients', { params: {} });
  });

  it('TC-CLI-FE-02 — pasa filtros como params', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: PAGED_RESULT } });

    await clientService.getAll({ Search: 'Juan', Status: 'Activo', PageNumber: 2 });

    expect(api.get).toHaveBeenCalledWith('/clients', {
      params: { Search: 'Juan', Status: 'Activo', PageNumber: 2 },
    });
  });

  it('TC-CLI-FE-03 — retorna la lista paginada correctamente', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: PAGED_RESULT } });

    const result = await clientService.getAll();

    expect(result.TotalCount).toBe(1);
    expect(result.Items[0].TbnCode).toBe('TBN-001');
  });
});


describe('clientService.getById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-CLI-FE-04 — llama GET /clients/:id', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: { Id: 'uuid-001' } } });

    await clientService.getById('uuid-001');

    expect(api.get).toHaveBeenCalledWith('/clients/uuid-001');
  });

  it('TC-CLI-FE-05 — propaga el error 404', async () => {
    (api.get as Mock).mockRejectedValueOnce({ response: { status: 404 } });

    await expect(clientService.getById('no-existe')).rejects.toBeTruthy();
  });
});


describe('clientService.register', () => {
  beforeEach(() => vi.clearAllMocks());

  const REGISTER_DTO = {
    fullName:        'María López',
    identityCard:    '12345678',
    phoneMain:       '59170000002',
    zone:            'Sur',
    winboxNumber:    'WIN-001',
    planId:          'plan-uuid',
    installationDate: '2026-01-15',
    installationCost: 200,
  };

  it('TC-CLI-FE-06 — llama POST /clients con el dto', async () => {
    (api.post as Mock).mockResolvedValueOnce({ data: { data: CLIENT_LIST_ITEM } });

    await clientService.register(REGISTER_DTO as any);

    expect(api.post).toHaveBeenCalledWith('/clients', REGISTER_DTO);
  });

  it('TC-CLI-FE-07 — retorna el cliente creado', async () => {
    (api.post as Mock).mockResolvedValueOnce({ data: { data: CLIENT_LIST_ITEM } });

    const result = await clientService.register(REGISTER_DTO as any);

    expect(result.TbnCode).toBe('TBN-001');
    expect(result.Status).toBe('Activo');
  });
});


describe('clientService.suspend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-CLI-FE-08 — llama PUT /clients/:id/suspend', async () => {
    (api.put as Mock).mockResolvedValueOnce({});

    await clientService.suspend('uuid-001');

    expect(api.put).toHaveBeenCalledWith('/clients/uuid-001/suspend');
  });
});

describe('clientService.reactivate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-CLI-FE-09 — llama PUT /clients/:id/reactivate', async () => {
    (api.put as Mock).mockResolvedValueOnce({});

    await clientService.reactivate('uuid-001');

    expect(api.put).toHaveBeenCalledWith('/clients/uuid-001/reactivate');
  });
});


describe('clientService.cancel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-CLI-FE-10 — llama PUT /clients/:id/cancel con confirmed=false por defecto', async () => {
    (api.put as Mock).mockResolvedValueOnce({});

    await clientService.cancel('uuid-001');

    expect(api.put).toHaveBeenCalledWith(
      '/clients/uuid-001/cancel',
      null,
      { params: { confirmed: false } },
    );
  });

  it('TC-CLI-FE-11 — cancel con confirmed=true pasa el flag correcto', async () => {
    (api.put as Mock).mockResolvedValueOnce({});

    await clientService.cancel('uuid-001', true);

    expect(api.put).toHaveBeenCalledWith(
      '/clients/uuid-001/cancel',
      null,
      { params: { confirmed: true } },
    );
  });

  it('TC-CLI-FE-12 — respuesta 409 devuelve requiresConfirmation=true', async () => {
    (api.put as Mock).mockRejectedValueOnce({
      response: { status: 409, data: {} },
    });

    const result = await clientService.cancel('uuid-001');

    expect(result.requiresConfirmation).toBe(true);
  });

  it('TC-CLI-FE-13 — cancel exitoso retorna objeto vacío', async () => {
    (api.put as Mock).mockResolvedValueOnce({});

    const result = await clientService.cancel('uuid-001', true);

    expect(result).toEqual({});
  });
});


describe('clientService.getInvoices', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-CLI-FE-14 — llama GET /clients/:id/invoices sin year', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: { invoices: [] } } });

    await clientService.getInvoices('uuid-001');

    expect(api.get).toHaveBeenCalledWith(
      '/clients/uuid-001/invoices',
      { params: undefined },
    );
  });

  it('TC-CLI-FE-15 — pasa year como param cuando se especifica', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: { invoices: [] } } });

    await clientService.getInvoices('uuid-001', 2026);

    expect(api.get).toHaveBeenCalledWith(
      '/clients/uuid-001/invoices',
      { params: { year: 2026 } },
    );
  });
});


describe('clientService.getByPhone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-CLI-FE-16 — llama GET /clients/by-phone con el número como query param', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: { Id: 'uuid-001', FullName: 'Juan Mamani' } } });

    await clientService.getByPhone('71754388');

    expect(api.get).toHaveBeenCalledWith('/clients/by-phone', { params: { phone: '71754388' } });
  });

  it('TC-CLI-FE-17 — retorna null cuando el servidor responde con error (cliente no encontrado)', async () => {
    (api.get as Mock).mockRejectedValueOnce({ response: { status: 404 } });

    const result = await clientService.getByPhone('00000000');

    expect(result).toBeNull();
  });

  it('TC-CLI-FE-18 — retorna los datos del cliente cuando se encuentra', async () => {
    const cliente = { Id: 'uuid-002', FullName: 'Carlos Mamani', TbnCode: 'TBN-0006' };
    (api.get as Mock).mockResolvedValueOnce({ data: { data: cliente } });

    const result = await clientService.getByPhone('71754388');

    expect(result).not.toBeNull();
    expect(result!.TbnCode).toBe('TBN-0006');
    expect(result!.FullName).toBe('Carlos Mamani');
  });

  it('TC-CLI-FE-19 — retorna null cuando la respuesta data es null (cliente no registrado)', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: null } });

    const result = await clientService.getByPhone('70000000');

    expect(result).toBeNull();
  });
});
