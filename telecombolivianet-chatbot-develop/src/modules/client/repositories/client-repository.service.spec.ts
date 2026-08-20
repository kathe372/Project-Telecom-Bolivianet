import { ClientRepositoryService } from './client-repository.service';

function makeRepo() {
  const auth = { http: { get: jest.fn(), post: jest.fn() }, ensureToken: jest.fn() } as any;
  const repo = new ClientRepositoryService(auth);
  const get  = jest.fn();
  const post = jest.fn();
  (repo as any).get  = get;
  (repo as any).post = post;
  return { repo, get, post };
}

describe('ClientRepositoryService', () => {
  describe('getClientByPhone — normalización de teléfono', () => {
    it('quita el prefijo 591 antes de consultar', async () => {
      const { repo, get } = makeRepo();
      get.mockResolvedValue({ Id: 'C1', FullName: 'jhael' });
      await repo.getClientByPhone('59171435981');
      expect(get).toHaveBeenCalledWith('/api/clients/by-phone', { phone: '71435981' });
    });

    it('deja el número tal cual si no empieza con 591', async () => {
      const { repo, get } = makeRepo();
      get.mockResolvedValue(null);
      await repo.getClientByPhone('71435981');
      expect(get).toHaveBeenCalledWith('/api/clients/by-phone', { phone: '71435981' });
    });

    it('404 → devuelve null (cliente no existe)', async () => {
      const { repo, get } = makeRepo();
      get.mockRejectedValue({ response: { status: 404 } });
      expect(await repo.getClientByPhone('71435981')).toBeNull();
    });

    it('otro error → propaga', async () => {
      const { repo, get } = makeRepo();
      get.mockRejectedValue({ response: { status: 500 }, message: 'boom' });
      await expect(repo.getClientByPhone('71435981')).rejects.toEqual(expect.objectContaining({ message: 'boom' }));
    });
  });

  describe('getClientInvoices', () => {
    it('devuelve el arreglo Invoices', async () => {
      const { repo, get } = makeRepo();
      get.mockResolvedValue({ Invoices: [{ Amount: 149 }] });
      expect(await repo.getClientInvoices('C1', 2026)).toEqual([{ Amount: 149 }]);
      expect(get).toHaveBeenCalledWith('/api/clients/C1/invoices/bot', { year: 2026 });
    });

    it('sin data → arreglo vacío', async () => {
      const { repo, get } = makeRepo();
      get.mockResolvedValue(null);
      expect(await repo.getClientInvoices('C1')).toEqual([]);
    });
  });

  describe('getPendingInvoices — filtra Pendiente/Vencida', () => {
    it('excluye las Pagadas', async () => {
      const { repo, get } = makeRepo();
      get.mockResolvedValue({ Invoices: [
        { Status: 'Pendiente', Amount: 1 },
        { Status: 'Vencida',   Amount: 2 },
        { Status: 'Pagada',    Amount: 3 },
      ] });
      const pend = await repo.getPendingInvoices('C1');
      expect(pend.map((i: any) => i.Status)).toEqual(['Pendiente', 'Vencida']);
    });
  });

  describe('requestPlanChange', () => {
    it('postea el cambio con el payload esperado', async () => {
      const { repo, post } = makeRepo();
      post.mockResolvedValue({ changeId: 'ch-1' });
      const r = await repo.requestPlanChange('C1', 'PLAN-ORO', 'quiere más velocidad');
      expect(post).toHaveBeenCalledWith('/api/clients/request-plan-change', {
        ClientId: 'C1', NewPlanId: 'PLAN-ORO', Notes: 'quiere más velocidad',
      });
      expect(r).toEqual({ changeId: 'ch-1' });
    });
  });
});
