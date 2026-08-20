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
import { ticketService } from './ticketService';


const TICKET_ITEM = {
  Id:           'tkt-uuid-001',
  TicketNumber: 'TK-2026-0001',
  Subject:      'Sin internet',
  Status:       'Abierto',
  Priority:     'Alta',
  ClientName:   'Juan Mamani',
  CreatedAt:    '2026-04-27T08:00:00Z',
};

const PAGED_TICKETS = {
  Items:       [TICKET_ITEM],
  TotalCount:  1,
  PageNumber:  1,
  PageSize:    20,
  TotalPages:  1,
  HasPreviousPage: false,
  HasNextPage:     false,
};


describe('ticketService.getAll', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-TKT-FE-01 — llama GET /tickets con paginación por defecto', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: PAGED_TICKETS } });

    await ticketService.getAll({});

    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/tickets'),
    );
  });

  it('TC-TKT-FE-02 — construye la URL con filtros de estado y prioridad', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: PAGED_TICKETS } });

    await ticketService.getAll({ Status: 'Abierto', Priority: 'Alta' } as any);

    const url = (api.get as Mock).mock.calls[0][0] as string;
    expect(url).toContain('Status=Abierto');
    expect(url).toContain('Priority=Alta');
  });

  it('TC-TKT-FE-03 — retorna la lista paginada', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: PAGED_TICKETS } });

    const result = await ticketService.getAll({});

    expect(result.TotalCount).toBe(1);
    expect(result.Items[0].TicketNumber).toBe('TK-2026-0001');
  });
});


describe('ticketService.getById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-TKT-FE-04 — llama GET /tickets/:id', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: TICKET_ITEM } });

    await ticketService.getById('tkt-uuid-001');

    expect(api.get).toHaveBeenCalledWith('/tickets/tkt-uuid-001');
  });
});


describe('ticketService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-TKT-FE-05 — llama POST /tickets con el dto de creación', async () => {
    (api.post as Mock).mockResolvedValueOnce({ data: { data: TICKET_ITEM } });

    const dto = {
      clientId:    'uuid-001',
      subject:     'Sin internet',
      type:        'SoporteTecnico',
      priority:    'Alta',
      description: 'El cliente no tiene conexión.',
    };

    await ticketService.create(dto as any);

    expect(api.post).toHaveBeenCalledWith('/tickets', dto);
  });

  it('TC-TKT-FE-06 — retorna el ticket creado con número asignado', async () => {
    (api.post as Mock).mockResolvedValueOnce({ data: { data: TICKET_ITEM } });

    const result = await ticketService.create({} as any);

    expect(result.TicketNumber).toBe('TK-2026-0001');
    expect(result.Status).toBe('Abierto');
  });
});


describe('ticketService.changeStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-TKT-FE-07 — llama PATCH /tickets/:id/status con el ChangeTicketStatusRequest', async () => {
    (api.patch as Mock).mockResolvedValueOnce({ data: { data: TICKET_ITEM } });

    const dto = { NewStatus: 'EnProceso', Message: 'Iniciando revisión' };
    await ticketService.changeStatus('tkt-uuid-001', dto as any);

    expect(api.patch).toHaveBeenCalledWith(
      '/tickets/tkt-uuid-001/status',
      dto,
    );
  });
});


describe('ticketService.assign', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-TKT-FE-08 — llama PATCH /tickets/:id/assign con el AssignTicketRequest', async () => {
    (api.patch as Mock).mockResolvedValueOnce({ data: { data: TICKET_ITEM } });

    const dto = { AssignedToUserId: 'tecnico-uuid-001' };
    await ticketService.assign('tkt-uuid-001', dto as any);

    expect(api.patch).toHaveBeenCalledWith(
      '/tickets/tkt-uuid-001/assign',
      dto,
    );
  });
});


describe('ticketService.addComment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-TKT-FE-09 — llama POST /tickets/:id/comments con el AddCommentRequest', async () => {
    (api.post as Mock).mockResolvedValueOnce({ data: { data: {} } });

    const dto = { Text: 'Revisado en campo, falla de ONT.' };
    await ticketService.addComment('tkt-uuid-001', dto as any);

    expect(api.post).toHaveBeenCalledWith(
      '/tickets/tkt-uuid-001/comments',
      dto,
    );
  });
});


describe('ticketService.close', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-TKT-FE-10 — llama PATCH /tickets/:id/close con body vacío', async () => {
    (api.patch as Mock).mockResolvedValueOnce({ data: { data: TICKET_ITEM } });

    await ticketService.close('tkt-uuid-001');

    expect(api.patch).toHaveBeenCalledWith('/tickets/tkt-uuid-001/close', {});
  });
});


describe('ticketService.getSlaPlans', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-TKT-FE-11 — llama GET /tickets/sla-plans', async () => {
    (api.get as Mock).mockResolvedValueOnce({ data: { data: [] } });

    await ticketService.getSlaPlans();

    expect(api.get).toHaveBeenCalledWith('/tickets/sla-plans');
  });
});


describe('ticketService.getKpi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC-TKT-FE-12 — llama GET /tickets/kpi', async () => {
    (api.get as Mock).mockResolvedValueOnce({
      data: { data: { TotalOpen: 5, TotalInProcess: 2, TotalResolved: 0, TotalClosed: 0,
                      OverdueSla: 1, CreatedToday: 3, SlaCompliantCount: 4, SlaBreachedCount: 1, AvgCsatScore: null } },
    });

    const kpi = await ticketService.getKpi();

    expect(api.get).toHaveBeenCalledWith('/tickets/kpi');
    expect(kpi.TotalOpen).toBe(5);
  });
});
