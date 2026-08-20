import { SessionLoadHandler } from './session-load.handler';
import { MessageContext } from './message-context';
import { SessionData } from '../../session/session.service';


const makeCtx = (overrides: Partial<MessageContext> = {}): MessageContext =>
  ({ phone: '59170000001', messageId: 'MSG-001', type: 'text', humanAvailable: false, ...overrides } as MessageContext);

const makeSession = (overrides: Partial<SessionData> = {}): SessionData => ({
  phoneNumber:         '59170000001',
  clientId:            null,
  clientName:          null,
  clientStatus:        null,
  planId:              null,
  planName:            null,
  totalDebt:           0,
  tbnCode:             null,
  activeTicketId:      null,
  activeInstallationId: null,
  pendingAction:       null,
  pendingTechIssue:    null,
  pendingCsatTicketId: null,
  isEscalated:         false,
  lastSentiment:       'neutral',
  angryCount:          0,
  lastLocation:        null,
  pendingImageId:      null,
  pendingImageCaption: null,
  previousSummary:     null,
  previousSummaryAt:   null,
  messages:            [],
  ...overrides,
});

describe('SessionLoadHandler', () => {
  const sessionMock = {
    getSession:    jest.fn(),
    withLock:      jest.fn(),
    updateSession: jest.fn(),
  };
  const memoryMock = { loadReturningContext: jest.fn() };
  let handler: SessionLoadHandler;

  beforeEach(() => {
    jest.resetAllMocks();
    sessionMock.withLock.mockImplementation((_phone: string, fn: () => Promise<void>) => fn());
    sessionMock.updateSession.mockImplementation((_p: string, patch: any) => Promise.resolve({ messages: [], ...patch }));
    memoryMock.loadReturningContext.mockResolvedValue(null);
    handler = new SessionLoadHandler(sessionMock as any, memoryMock as any);
  });

  it('carga la sesión y la asigna a ctx.session', async () => {
    const session = makeSession({ clientId: 'C-123', clientName: 'Ana López' });
    sessionMock.getSession.mockResolvedValue(session);

    const ctx = makeCtx({ phone: '59171234567' });
    await handler.handle(ctx, jest.fn().mockResolvedValue(undefined));

    expect(sessionMock.getSession).toHaveBeenCalledWith('59171234567');
    expect(ctx.session).toBe(session);
  });

  it('llama a next() después de cargar la sesión', async () => {
    sessionMock.getSession.mockResolvedValue(makeSession());
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(makeCtx(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('asigna sesión vacía para un número nuevo', async () => {
    const emptySession = makeSession();
    sessionMock.getSession.mockResolvedValue(emptySession);

    const ctx = makeCtx();
    await handler.handle(ctx, jest.fn().mockResolvedValue(undefined));

    expect(ctx.session).toEqual(emptySession);
    expect(ctx.session!.clientId).toBeNull();
  });

  describe('MEJORA-1D: contexto de conversación anterior', () => {
    it('sesión nueva + resumen previo en BD → lo inyecta en la sesión', async () => {
      sessionMock.getSession.mockResolvedValue(makeSession());
      memoryMock.loadReturningContext.mockResolvedValue({
        summary: 'Cliente reportó internet lento; ticket creado.', summaryAt: 1234567890,
      });

      const ctx = makeCtx();
      await handler.handle(ctx, jest.fn().mockResolvedValue(undefined));

      expect(sessionMock.updateSession).toHaveBeenCalledWith(ctx.phone, {
        previousSummary:   'Cliente reportó internet lento; ticket creado.',
        previousSummaryAt: 1234567890,
      });
      expect(ctx.session!.previousSummary).toContain('internet lento');
    });

    it('sesión ACTIVA (con mensajes) → NO consulta la memoria', async () => {
      sessionMock.getSession.mockResolvedValue(makeSession({
        messages: [{ role: 'user', content: 'hola', timestamp: 1 }],
      }));

      await handler.handle(makeCtx(), jest.fn().mockResolvedValue(undefined));

      expect(memoryMock.loadReturningContext).not.toHaveBeenCalled();
    });

    it('usuario nuevo sin historial → sigue sin contexto y sin romper', async () => {
      sessionMock.getSession.mockResolvedValue(makeSession());
      memoryMock.loadReturningContext.mockResolvedValue(null);

      const ctx = makeCtx();
      await handler.handle(ctx, jest.fn().mockResolvedValue(undefined));

      expect(sessionMock.updateSession).not.toHaveBeenCalled();
      expect(ctx.session!.previousSummary).toBeNull();
    });
  });
});
