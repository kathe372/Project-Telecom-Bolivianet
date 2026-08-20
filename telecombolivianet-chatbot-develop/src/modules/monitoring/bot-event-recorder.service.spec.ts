import { BotEventRecorderService } from './bot-event-recorder.service';

describe('BotEventRecorderService (MEJORA-1A)', () => {
  const repo = {
    create: jest.fn((x) => x),
    save:   jest.fn().mockResolvedValue({}),
  };
  let service: BotEventRecorderService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.save.mockResolvedValue({});
    service = new BotEventRecorderService(repo as any);
  });

  it('persiste el evento agent_run con los campos normalizados', async () => {
    service.recordAgentRun({
      phoneNumber: '59171000001',
      toolsCalled: ['get_client_debt'],
      durationMs: 1234.7,
      responseLength: 80,
      sentiment: 'neutral',
    });
    await new Promise((r) => setImmediate(r));

    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      phoneNumber: '59171000001',
      eventType:   'agent_run',
      toolsCalled: ['get_client_debt'],
      durationMs:  1235,
      sentiment:   'neutral',
    }));
  });

  it('nunca propaga errores de persistencia (fire-and-forget)', async () => {
    repo.save.mockRejectedValue(new Error('DB caída'));
    expect(() => service.recordAgentRun({
      phoneNumber: 'x', toolsCalled: [], durationMs: 1, responseLength: 0,
    })).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });

  it('normaliza toolsCalled nulo y duración negativa', async () => {
    service.recordAgentRun({
      phoneNumber: 'x', toolsCalled: undefined as any, durationMs: -5, responseLength: 0,
    });
    await new Promise((r) => setImmediate(r));
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      toolsCalled: [], durationMs: 0,
    }));
  });
});
