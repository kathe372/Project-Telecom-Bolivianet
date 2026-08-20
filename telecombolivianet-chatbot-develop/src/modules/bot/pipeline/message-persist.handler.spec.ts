import { MessagePersistHandler } from './message-persist.handler';
import { MessageContext } from './message-context';
import { buildSession, buildClientSession } from '../../../test/factories/session.factory';


const makeCtx = (overrides: Partial<MessageContext> = {}): MessageContext =>
  ({
    phone:          '59171000001',
    messageId:      'msg-001',
    type:           'text',
    userContent:    'Hola, necesito ayuda',
    humanAvailable: false,
    session:        buildSession(),
    ...overrides,
  } as MessageContext);

describe('MessagePersistHandler', () => {
  const sessionSvc = { addMessage: jest.fn() };
  const persistence = { persistMessage: jest.fn() };
  let handler: MessagePersistHandler;

  beforeEach(() => {
    jest.resetAllMocks();
    sessionSvc.addMessage.mockResolvedValue(undefined);
    persistence.persistMessage.mockResolvedValue(undefined);
    handler = new MessagePersistHandler(sessionSvc as any, persistence as any);
  });


  it('isFirstContact=true cuando la sesión no tiene mensajes previos', async () => {
    const ctx = makeCtx({ session: buildSession({ messages: [] }) });
    await handler.handle(ctx, jest.fn().mockResolvedValue(undefined));

    expect(ctx.isFirstContact).toBe(true);
  });

  it('isFirstContact=false cuando la sesión ya tiene mensajes', async () => {
    const ctx = makeCtx({
      session: buildSession({ messages: [{ role: 'user', content: 'anterior', timestamp: Date.now() }] }),
    });
    await handler.handle(ctx, jest.fn().mockResolvedValue(undefined));

    expect(ctx.isFirstContact).toBe(false);
  });


  it('llama a addMessage con phone, rol user y contenido del mensaje', async () => {
    const ctx = makeCtx({ phone: '59171999001', userContent: 'Mi internet falla' });
    await handler.handle(ctx, jest.fn().mockResolvedValue(undefined));

    expect(sessionSvc.addMessage).toHaveBeenCalledWith(
      '59171999001',
      'user',
      'Mi internet falla',
    );
  });

  it('llama a persistMessage con los datos de sesión y mensaje', async () => {
    const session = buildClientSession();
    const ctx = makeCtx({ session, userContent: 'Consulto mi deuda' });
    await handler.handle(ctx, jest.fn().mockResolvedValue(undefined));

    expect(persistence.persistMessage).toHaveBeenCalledWith(
      session,
      'user',
      'Consulto mi deuda',
      null,
      undefined,
      ctx.incomingMediaUrl,
      ctx.incomingMediaType,
    );
  });

  it('propaga incomingMediaUrl e incomingMediaType a persistMessage', async () => {
    const ctx = makeCtx({
      incomingMediaUrl:  'https://cdn.example.com/img.jpg',
      incomingMediaType: 'image',
    });
    await handler.handle(ctx, jest.fn().mockResolvedValue(undefined));

    expect(persistence.persistMessage).toHaveBeenCalledWith(
      expect.anything(),
      'user',
      expect.anything(),
      null,
      undefined,
      'https://cdn.example.com/img.jpg',
      'image',
    );
  });


  it('llama a next() después de persistir', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    await handler.handle(makeCtx(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('llama a next() incluso sin media adjunta (campos undefined)', async () => {
    const ctx = makeCtx({ incomingMediaUrl: undefined, incomingMediaType: undefined });
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
