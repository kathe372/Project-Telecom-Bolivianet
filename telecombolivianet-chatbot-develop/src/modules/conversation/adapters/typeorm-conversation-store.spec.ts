import { TypeOrmConversationStore } from './typeorm-conversation-store';

function build() {
  const convRepo = {
    findOne: jest.fn(),
    create:  jest.fn().mockImplementation((c) => c),
    save:    jest.fn().mockImplementation((c) => Promise.resolve({ id: 'conv-1', ...c })),
    update:  jest.fn().mockResolvedValue(undefined),
  };
  const msgRepo = { create: jest.fn().mockImplementation((m) => m), save: jest.fn().mockResolvedValue(undefined) };
  return { store: new TypeOrmConversationStore(convRepo as any, msgRepo as any), convRepo, msgRepo };
}

describe('TypeOrmConversationStore', () => {
  it('findOrCreate: crea si no existe', async () => {
    const { store, convRepo } = build();
    convRepo.findOne.mockResolvedValue(null);
    await store.findOrCreate('71435981', 'jhael');
    expect(convRepo.create).toHaveBeenCalledWith({ phoneNumber: '71435981', clientName: 'jhael' });
    expect(convRepo.save).toHaveBeenCalled();
  });

  it('findOrCreate: actualiza el nombre si cambió', async () => {
    const { store, convRepo } = build();
    convRepo.findOne.mockResolvedValue({ id: 'c1', phoneNumber: '71435981', clientName: 'viejo' });
    await store.findOrCreate('71435981', 'nuevo');
    expect(convRepo.save).toHaveBeenCalledWith(expect.objectContaining({ clientName: 'nuevo' }));
  });

  it('findOrCreate: no re-guarda si el nombre es el mismo', async () => {
    const { store, convRepo } = build();
    convRepo.findOne.mockResolvedValue({ id: 'c1', phoneNumber: '71435981', clientName: 'jhael' });
    await store.findOrCreate('71435981', 'jhael');
    expect(convRepo.save).not.toHaveBeenCalled();
  });

  it('addMessage: persiste con source por defecto SYSTEM', async () => {
    const { store, msgRepo } = build();
    await store.addMessage('conv-1', { role: 'user', content: 'hola' } as any);
    expect(msgRepo.save).toHaveBeenCalled();
    expect(msgRepo.create).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv-1', content: 'hola' }));
  });

  it('markEscalated: marca escalado con agente y fecha', async () => {
    const { store, convRepo } = build();
    await store.markEscalated('conv-1', 'Carlos');
    expect(convRepo.update).toHaveBeenCalledWith('conv-1', expect.objectContaining({ isEscalated: true, agentName: 'Carlos' }));
  });
});
