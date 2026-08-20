import { EscalationCheckHandler } from './escalation-check.handler';
import { MessageContext } from './message-context';
import { SessionData } from '../../session/session.service';
import { MessageSource } from '../../../database/entities/message.entity';


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
  messages:            [],
  ...overrides,
});

const makeCtx = (overrides: Partial<MessageContext> = {}): MessageContext =>
  ({
    phone:       '59170000001',
    messageId:   'MSG-001',
    type:        'text',
    userContent: 'Hola',
    session:     makeSession(),
    ...overrides,
  } as MessageContext);

describe('EscalationCheckHandler', () => {
  const sessionMock     = { claimOnce: jest.fn() };
  const persistenceMock = { persistMessage: jest.fn() };
  const senderMock      = { send: jest.fn() };
  let handler: EscalationCheckHandler;

  beforeEach(() => {
    jest.resetAllMocks();
    persistenceMock.persistMessage.mockResolvedValue(undefined);
    sessionMock.claimOnce.mockResolvedValue(true);
    senderMock.send.mockResolvedValue(undefined);
    handler = new EscalationCheckHandler(
      sessionMock as any, persistenceMock as any, senderMock as any,
    );
  });


  it('llama a next() cuando la sesión NO está escalada', async () => {
    const ctx  = makeCtx({ session: makeSession({ isEscalated: false }) });
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(persistenceMock.persistMessage).not.toHaveBeenCalled();
  });

  it('pasa la cadena normalmente si session es undefined', async () => {
    const ctx  = makeCtx({ session: undefined });
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
  });


  it('persiste el mensaje del usuario cuando la sesión está escalada', async () => {
    const session = makeSession({ isEscalated: true });
    const ctx = makeCtx({
      session,
      userContent:      'Necesito ayuda',
      incomingMediaUrl:  'https://cdn/img.jpg',
      incomingMediaType: 'image',
    });
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(persistenceMock.persistMessage).toHaveBeenCalledWith(
      session,
      'user',
      'Necesito ayuda',
      MessageSource.ADMIN,
      undefined,
      'https://cdn/img.jpg',
      'image',
    );
  });

  it('NO llama a next() cuando la sesión está escalada', async () => {
    const ctx  = makeCtx({ session: makeSession({ isEscalated: true }) });
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(next).not.toHaveBeenCalled();
  });

  // 2026-08-07: acá el bot quedaba en silencio ABSOLUTO. En una prueba real el
  // cliente escribió, no recibió nada, y volvió a escribir. En produccion la
  // espera puede llegar a 24 h: el histórico tiene 22 escalaciones contra 3
  // respuestas humanas en toda la vida del sistema.
  describe('acuse de recibo mientras está escalada', () => {
    it('avisa al cliente que su consulta está con un agente', async () => {
      const ctx = makeCtx({ session: makeSession({ isEscalated: true }) });

      await handler.handle(ctx, jest.fn());

      expect(senderMock.send).toHaveBeenCalledTimes(1);
      expect(senderMock.send.mock.calls[0][1]).toMatch(/agente/i);
    });

    // El bot NO retoma: hay consultas que solo un agente puede resolver.
    it('sigue sin procesar el mensaje con el agente de IA', async () => {
      const ctx  = makeCtx({ session: makeSession({ isEscalated: true }) });
      const next = jest.fn();

      await handler.handle(ctx, next);

      expect(next).not.toHaveBeenCalled();
      expect(persistenceMock.persistMessage).toHaveBeenCalled();
    });

    it('no repite el acuse en una ráfaga de mensajes', async () => {
      sessionMock.claimOnce.mockResolvedValue(false);
      const ctx = makeCtx({ session: makeSession({ isEscalated: true }) });

      await handler.handle(ctx, jest.fn());

      expect(senderMock.send).not.toHaveBeenCalled();
      // El mensaje igual se guarda para que el agente lo lea.
      expect(persistenceMock.persistMessage).toHaveBeenCalled();
    });

    it('si el envío del acuse falla, el mensaje del cliente igual se guarda', async () => {
      senderMock.send.mockRejectedValue(new Error('WhatsApp caído'));
      const ctx = makeCtx({ session: makeSession({ isEscalated: true }) });

      await expect(handler.handle(ctx, jest.fn())).resolves.not.toThrow();
      expect(persistenceMock.persistMessage).toHaveBeenCalled();
    });
  });

});
