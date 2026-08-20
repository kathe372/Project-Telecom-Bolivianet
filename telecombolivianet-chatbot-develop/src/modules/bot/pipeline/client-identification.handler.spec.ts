import { ClientIdentificationHandler } from './client-identification.handler';
import { MessageContext } from './message-context';
import { SessionData } from '../../session/session.service';


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
  // 2026-08-05: fresco por default — así los tests existentes que no son
  // SOBRE la re-verificación no disparan una consulta al backend de más.
  identityVerifiedAt:  Date.now(),
  ambiguousClients:    null,
  ...overrides,
});

const makeCtx = (overrides: Partial<MessageContext> = {}): MessageContext =>
  ({
    phone:     '59170000001',
    messageId: 'MSG-001',
    type:      'text',
    session:   makeSession(),
    ...overrides,
  } as MessageContext);

const CLIENT_DATA = {
  Id:         'C-123',
  FullName:   'Roberto Mamani',
  Status:     'Activo',
  PlanId:     'PLAN-1',
  PlanName:   'Plan Plata',
  TotalDebt:  150.0,
  TbnCode:    'TBN-0042',
};

const CLIENT_DATA_2 = {
  Id:         'C-456',
  FullName:   'María Mamani',
  Status:     'Activo',
  PlanId:     'PLAN-2',
  PlanName:   'Plan Oro',
  TotalDebt:  0,
  TbnCode:    'TBN-0099',
};

describe('ClientIdentificationHandler', () => {
  const sessionMock    = {
    setClientData:  jest.fn(),
    updateSession:  jest.fn(),
    getSession:     jest.fn(),
    patchSession:   jest.fn(),
  };
  const clientRepoMock = { getClientsByPhone: jest.fn() };
  const ticketRepoMock = { getClientActiveTickets: jest.fn() };
  const convRepoMock   = { upsert: jest.fn() };
  const configMock     = { get: jest.fn() };
  let handler: ClientIdentificationHandler;

  beforeEach(() => {
    jest.resetAllMocks();
    sessionMock.setClientData.mockResolvedValue(undefined);
    sessionMock.updateSession.mockResolvedValue(undefined);
    sessionMock.patchSession.mockResolvedValue(undefined);
    sessionMock.getSession.mockResolvedValue(makeSession());
    ticketRepoMock.getClientActiveTickets.mockResolvedValue([]);
    convRepoMock.upsert.mockResolvedValue(undefined);
    configMock.get.mockReturnValue(undefined); // usa el default (120 min)
    handler = new ClientIdentificationHandler(
      sessionMock as any,
      clientRepoMock as any,
      ticketRepoMock as any,
      convRepoMock as any,
      configMock as any,
    );
  });


  it('no consulta la API si el cliente ya está identificado en sesión (fresco)', async () => {
    const session = makeSession({ clientId: 'C-123', clientName: 'Roberto Mamani' });
    const ctx     = makeCtx({ session });
    const next    = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(clientRepoMock.getClientsByPhone).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('no re-identifica si clientName es __prospect__ (fresco)', async () => {
    const session = makeSession({ clientId: null, clientName: '__prospect__' });
    const ctx     = makeCtx({ session });
    const next    = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(clientRepoMock.getClientsByPhone).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });


  it('identifica al cliente cuando la sesión es nueva', async () => {
    clientRepoMock.getClientsByPhone.mockResolvedValue([CLIENT_DATA]);
    const afterIdentify = makeSession({ clientId: 'C-123', clientName: 'Roberto Mamani' });
    sessionMock.getSession.mockResolvedValue(afterIdentify);

    const ctx  = makeCtx({ phone: '59178901234', session: makeSession({ identityVerifiedAt: null }) });
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(clientRepoMock.getClientsByPhone).toHaveBeenCalledWith('59178901234');
    expect(sessionMock.setClientData).toHaveBeenCalledWith('59178901234', {
      clientId:           'C-123',
      clientName:         'Roberto Mamani',
      clientStatus:       'Activo',
      planId:             'PLAN-1',
      planName:           'Plan Plata',
      totalDebt:          150.0,
      tbnCode:            'TBN-0042',
      // 2026-08-07: el backend ya devolvia PlanSpeedMbps y se descartaba. Hace
      // falta para calcular el umbral de la prueba de velocidad en soporte.
      planSpeedMbps:      null,
      identityVerifiedAt: expect.any(Number),
    });
    expect(ctx.updatedSession).toBe(afterIdentify);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('marca como prospect si getClientsByPhone devuelve lista vacía', async () => {
    clientRepoMock.getClientsByPhone.mockResolvedValue([]);
    sessionMock.getSession.mockResolvedValue(makeSession({ clientName: '__prospect__' }));

    const ctx  = makeCtx({ session: makeSession({ identityVerifiedAt: null }) });
    const next = jest.fn().mockResolvedValue(undefined);

    await handler.handle(ctx, next);

    expect(sessionMock.updateSession).toHaveBeenCalledWith(
      '59170000001',
      {
        clientName:         '__prospect__',
        ambiguousClients:   null,
        identityVerifiedAt: expect.any(Number),
      },
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('si getClientsByPhone lanza error, igualmente llama next()', async () => {
    clientRepoMock.getClientsByPhone.mockRejectedValue(new Error('Backend no disponible'));
    sessionMock.getSession.mockResolvedValue(makeSession());

    const ctx  = makeCtx({ session: makeSession({ identityVerifiedAt: null }) });
    const next = jest.fn().mockResolvedValue(undefined);

    await expect(handler.handle(ctx, next)).resolves.not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });


  it('guarda la ubicación en sesión si el tipo es location', async () => {
    const session = makeSession({ clientId: 'C-123', clientName: 'Ana' });
    const ctx = makeCtx({
      session,
      type:            'location',
      locationLat:     -16.5,
      locationLng:     -68.15,
      locationName:    'Plaza Murillo',
      locationAddress: 'La Paz',
    });

    await handler.handle(ctx, jest.fn().mockResolvedValue(undefined));

    expect(sessionMock.updateSession).toHaveBeenCalledWith(
      '59170000001',
      {
        lastLocation: {
          lat:     -16.5,
          lng:     -68.15,
          name:    'Plaza Murillo',
          address: 'La Paz',
        },
        locationCapturedAt: expect.any(Number),
        locationSource:     'whatsapp_gps',
      },
    );
  });

  it('no guarda ubicación si las coordenadas son undefined', async () => {
    const session = makeSession({ clientId: 'C-123', clientName: 'Ana' });
    const ctx = makeCtx({
      session,
      type:        'location',
      locationLat: undefined,
      locationLng: undefined,
    });

    await handler.handle(ctx, jest.fn().mockResolvedValue(undefined));

    expect(sessionMock.updateSession).not.toHaveBeenCalled();
  });


  describe('re-verificación periódica (2026-08-05: número de cliente actualizado)', () => {
    it('identidad cacheada pero VENCIDA (más de identityReverifyMinutes) → vuelve a consultar', async () => {
      configMock.get.mockReturnValue(120); // 2h
      const dosHorasYMedioAtras = Date.now() - 150 * 60_000;
      const session = makeSession({
        clientId: 'C-OLD', clientName: 'Nombre Viejo', identityVerifiedAt: dosHorasYMedioAtras,
      });
      clientRepoMock.getClientsByPhone.mockResolvedValue([CLIENT_DATA]);
      sessionMock.getSession.mockResolvedValue(makeSession({ clientId: 'C-123' }));

      const ctx  = makeCtx({ session });
      const next = jest.fn().mockResolvedValue(undefined);

      await handler.handle(ctx, next);

      expect(clientRepoMock.getClientsByPhone).toHaveBeenCalledWith('59170000001');
      expect(sessionMock.setClientData).toHaveBeenCalledWith(
        '59170000001', expect.objectContaining({ clientId: 'C-123' }),
      );
    });

    it('identidad cacheada y RECIENTE (dentro de identityReverifyMinutes) → no vuelve a consultar', async () => {
      configMock.get.mockReturnValue(120);
      const diezMinutosAtras = Date.now() - 10 * 60_000;
      const session = makeSession({
        clientId: 'C-123', clientName: 'Roberto Mamani', identityVerifiedAt: diezMinutosAtras,
      });

      await handler.handle(makeCtx({ session }), jest.fn().mockResolvedValue(undefined));

      expect(clientRepoMock.getClientsByPhone).not.toHaveBeenCalled();
    });
  });

  describe('ambigüedad: teléfono con más de un cliente asociado (2026-08-05)', () => {
    it('2 clientes con el mismo teléfono → NO elige uno, guarda ambiguousClients y deja clientId null', async () => {
      clientRepoMock.getClientsByPhone.mockResolvedValue([CLIENT_DATA, CLIENT_DATA_2]);
      sessionMock.getSession.mockResolvedValue(makeSession({ ambiguousClients: [] as any }));

      const ctx  = makeCtx({ session: makeSession({ identityVerifiedAt: null }) });
      const next = jest.fn().mockResolvedValue(undefined);

      await handler.handle(ctx, next);

      expect(sessionMock.setClientData).not.toHaveBeenCalled();
      expect(sessionMock.updateSession).toHaveBeenCalledWith(
        '59170000001',
        expect.objectContaining({
          clientId:   null,
          clientName: null,
          ambiguousClients: [
            expect.objectContaining({ clientId: 'C-123', tbnCode: 'TBN-0042' }),
            expect.objectContaining({ clientId: 'C-456', tbnCode: 'TBN-0099' }),
          ],
        }),
      );
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('ya hay una elección pendiente en sesión → no vuelve a consultar el backend', async () => {
      const session = makeSession({
        ambiguousClients: [
          { clientId: 'C-123', clientName: 'Roberto', clientStatus: 'Activo', planId: 'P1', planName: 'Plata', totalDebt: 0, tbnCode: 'TBN-0042' },
        ],
      });
      const ctx  = makeCtx({ session });
      const next = jest.fn().mockResolvedValue(undefined);

      await handler.handle(ctx, next);

      expect(clientRepoMock.getClientsByPhone).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
