import { TicketRepositoryService } from './ticket-repository.service';

function makeRepo() {
  const auth = { http: {}, ensureToken: jest.fn() } as any;
  const repo = new TicketRepositoryService(auth);
  const get   = jest.fn();
  const post  = jest.fn();
  const patch = jest.fn();
  (repo as any).get   = get;
  (repo as any).post  = post;
  (repo as any).patch = patch;
  return { repo, get, post, patch };
}

describe('TicketRepositoryService', () => {
  it('buildTicketSubject arma el asunto con tipo, código, nombre y prioridad', () => {
    const { repo } = makeRepo();
    expect(repo.buildTicketSubject({
      type: 'SoporteTecnico', tbnCode: 'TBN-0001', clientName: 'jhael', priority: 'Alta',
    })).toBe('[SoporteTecnico] TBN-0001 — jhael (Alta)');
  });

  it('createTicket → POST /api/tickets con el dto', async () => {
    const { repo, post } = makeRepo();
    post.mockResolvedValue({ Id: 'T1', TicketNumber: 'TBN-T-1' });
    const dto = { ClientId: 'C1', Type: 'SoporteTecnico' } as any;
    const r = await repo.createTicket(dto);
    expect(post).toHaveBeenCalledWith('/api/tickets', dto);
    expect(r).toEqual({ Id: 'T1', TicketNumber: 'TBN-T-1' });
  });

  it('rescheduleTicket → PATCH /reprogramar con fecha y hora', async () => {
    const { repo, patch } = makeRepo();
    patch.mockResolvedValue(undefined);
    await repo.rescheduleTicket('T1', '2026-08-01', '10:00');
    expect(patch).toHaveBeenCalledWith('/api/tickets/T1/reprogramar', { Fecha: '2026-08-01', Hora: '10:00' });
  });

  it('closeTicket → PATCH /close con la nota de resolución', async () => {
    const { repo, patch } = makeRepo();
    patch.mockResolvedValue(undefined);
    await repo.closeTicket('T1', 'resuelto');
    expect(patch).toHaveBeenCalledWith('/api/tickets/T1/close', { ResolutionNote: 'resuelto' });
  });

  it('updateTicket → PATCH con description y rootCause (CSAT)', async () => {
    const { repo, patch } = makeRepo();
    patch.mockResolvedValue(undefined);
    await repo.updateTicket('T1', 'desc', 'CSAT: 5/5');
    expect(patch).toHaveBeenCalledWith('/api/tickets/T1', { Description: 'desc', RootCause: 'CSAT: 5/5' });
  });

  it('getClientActiveTickets → GET con clientId y status active', async () => {
    const { repo, get } = makeRepo();
    get.mockResolvedValue([{ Id: 'T1', Status: 'Abierto' }]);
    const r = await repo.getClientActiveTickets('C1');
    expect(get).toHaveBeenCalledWith('/api/tickets', { clientId: 'C1', status: 'active' });
    expect(r).toHaveLength(1);
  });

  it('reopenTicket → PATCH /reopen con el motivo', async () => {
    const { repo, patch } = makeRepo();
    patch.mockResolvedValue(undefined);
    await repo.reopenTicket('T1', 'volvió a fallar');
    expect(patch).toHaveBeenCalledWith('/api/tickets/T1/reopen', { Reason: 'volvió a fallar' });
  });
});
