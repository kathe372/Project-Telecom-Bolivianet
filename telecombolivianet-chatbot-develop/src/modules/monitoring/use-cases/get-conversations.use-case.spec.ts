import { GetConversationsUseCase } from './get-conversations.use-case';

function makeQb(rows: any[], total: number) {
  return {
    orderBy:  jest.fn().mockReturnThis(),
    where:    jest.fn().mockReturnThis(),
    skip:     jest.fn().mockReturnThis(),
    take:     jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(total),
    getMany:  jest.fn().mockResolvedValue(rows),
  };
}

const CONV = {
  id: 'c1', phoneNumber: '71435981', clientName: 'jhael',
  isEscalated: false, updatedAt: new Date('2026-07-20T10:00:00Z'), lastMessage: 'hola',
};

describe('GetConversationsUseCase', () => {
  it('tab "escaladas" → filtra por isEscalated = true', async () => {
    const qb = makeQb([CONV], 1);
    const uc = new GetConversationsUseCase({ createQueryBuilder: () => qb } as any);
    await uc.execute({ tab: 'escaladas', page: 1, limit: 20 });
    expect(qb.where).toHaveBeenCalledWith('c.isEscalated = :esc', { esc: true });
  });

  it('tab "en-atencion" → también filtra escaladas', async () => {
    const qb = makeQb([], 0);
    const uc = new GetConversationsUseCase({ createQueryBuilder: () => qb } as any);
    await uc.execute({ tab: 'en-atencion', page: 1, limit: 20 });
    expect(qb.where).toHaveBeenCalledWith('c.isEscalated = :esc', { esc: true });
  });

  it('tab "sin-responder" → usa la subconsulta EXISTS del último mensaje del usuario', async () => {
    const qb = makeQb([], 0);
    const uc = new GetConversationsUseCase({ createQueryBuilder: () => qb } as any);
    await uc.execute({ tab: 'sin-responder', page: 1, limit: 20 });
    expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('EXISTS'));
  });

  it('tab "todas" → sin filtro where', async () => {
    const qb = makeQb([CONV], 1);
    const uc = new GetConversationsUseCase({ createQueryBuilder: () => qb } as any);
    await uc.execute({ tab: 'todas', page: 1, limit: 20 });
    expect(qb.where).not.toHaveBeenCalled();
  });

  it('paginación: skip = (page-1)*limit, take = limit', async () => {
    const qb = makeQb([], 0);
    const uc = new GetConversationsUseCase({ createQueryBuilder: () => qb } as any);
    await uc.execute({ tab: 'todas', page: 3, limit: 15 });
    expect(qb.skip).toHaveBeenCalledWith(30);
    expect(qb.take).toHaveBeenCalledWith(15);
  });

  it('devuelve total, page, limit y conversaciones mapeadas a DTO', async () => {
    const qb = makeQb([CONV], 42);
    const uc = new GetConversationsUseCase({ createQueryBuilder: () => qb } as any);
    const res = await uc.execute({ tab: 'todas', page: 2, limit: 10 });
    expect(res.total).toBe(42);
    expect(res.page).toBe(2);
    expect(res.limit).toBe(10);
    expect(res.conversations[0]).toEqual({
      id: 'c1', phoneNumber: '71435981', clientName: 'jhael',
      isEscalated: false, lastMessage: 'hola', updatedAt: '2026-07-20T10:00:00.000Z',
    });
  });
});
