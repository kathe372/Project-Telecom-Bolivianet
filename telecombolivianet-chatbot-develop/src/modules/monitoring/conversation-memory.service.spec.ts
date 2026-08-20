import { ConversationMemoryService } from './conversation-memory.service';

describe('ConversationMemoryService (MEJORA-1D)', () => {
  const repo = { findOne: jest.fn() };
  let service: ConversationMemoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationMemoryService(repo as any);
  });

  it('devuelve el contexto cuando hay resumen', async () => {
    const when = new Date('2026-07-10T12:00:00Z');
    repo.findOne.mockResolvedValue({ summary: 'Reportó internet lento.', summaryAt: when });

    const ctx = await service.loadReturningContext('59171435981');
    expect(ctx).toEqual({ summary: 'Reportó internet lento.', summaryAt: when.getTime() });
  });

  it('devuelve null sin conversación o sin resumen', async () => {
    repo.findOne.mockResolvedValue(null);
    expect(await service.loadReturningContext('x')).toBeNull();

    repo.findOne.mockResolvedValue({ summary: '   ', summaryAt: null });
    expect(await service.loadReturningContext('x')).toBeNull();
  });

  it('degrada a null ante error de BD (la memoria es un extra)', async () => {
    repo.findOne.mockRejectedValue(new Error('DB caída'));
    expect(await service.loadReturningContext('x')).toBeNull();
  });
});
