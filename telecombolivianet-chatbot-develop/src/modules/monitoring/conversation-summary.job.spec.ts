import { ConversationSummaryJob } from './conversation-summary.job';

describe('ConversationSummaryJob (MEJORA-1D)', () => {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  const convRepo = { createQueryBuilder: jest.fn(() => qb), update: jest.fn().mockResolvedValue({}) };
  const msgRepo  = { find: jest.fn().mockResolvedValue([]) };
  const summarizer = { summarize: jest.fn() };
  let job: ConversationSummaryJob;

  beforeEach(() => {
    jest.clearAllMocks();
    convRepo.update.mockResolvedValue({});
    msgRepo.find.mockResolvedValue([
      { role: 'user', content: 'no tengo internet', createdAt: new Date() },
      { role: 'bot',  content: 'revisemos el router', createdAt: new Date() },
    ]);
    job = new ConversationSummaryJob(convRepo as any, msgRepo as any, summarizer as any);
  });

  it('resume candidatas y marca summary + summary_at', async () => {
    qb.getMany.mockResolvedValue([{ id: 'conv-1' }]);
    summarizer.summarize.mockResolvedValue('Cliente sin internet; se dieron pasos.');

    const res = await job.runOnce();

    expect(res).toEqual({ candidates: 1, summarized: 1 });
    expect(convRepo.update).toHaveBeenCalledWith({ id: 'conv-1' }, expect.objectContaining({
      summary: 'Cliente sin internet; se dieron pasos.',
      summaryAt: expect.any(Date),
    }));
  });

  it('con resumen vacío marca summary_at igual (no reintenta cada hora) sin pisar summary', async () => {
    qb.getMany.mockResolvedValue([{ id: 'conv-2' }]);
    summarizer.summarize.mockResolvedValue('');

    const res = await job.runOnce();

    expect(res).toEqual({ candidates: 1, summarized: 0 });
    const patch = convRepo.update.mock.calls[0][1];
    expect(patch.summaryAt).toBeInstanceOf(Date);
    expect(patch.summary).toBeUndefined();
  });

  it('sin candidatas no llama al LLM', async () => {
    qb.getMany.mockResolvedValue([]);
    const res = await job.runOnce();
    expect(res).toEqual({ candidates: 0, summarized: 0 });
    expect(summarizer.summarize).not.toHaveBeenCalled();
  });

  it('un fallo en una conversación no detiene el lote', async () => {
    qb.getMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    summarizer.summarize
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValueOnce('Resumen B.');

    const res = await job.runOnce();
    expect(res).toEqual({ candidates: 2, summarized: 1 });
  });
});
