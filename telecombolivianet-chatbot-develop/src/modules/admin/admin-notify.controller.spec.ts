import { BadRequestException } from '@nestjs/common';
import { AdminNotifyController, BotEventType } from './admin-notify.controller';

function build() {
  const config    = { get: jest.fn() };
  const session   = {
    updateSession: jest.fn().mockResolvedValue(undefined),
    deescalate:    jest.fn().mockResolvedValue(undefined),
    patchSession:  jest.fn().mockResolvedValue(undefined),
  };
  const whatsapp  = { sendText: jest.fn().mockResolvedValue('id'), sendButtons: jest.fn().mockResolvedValue('id') };
  const formatter = { botResumed: jest.fn().mockReturnValue('Bot reactivado.') };
  const clientRepo = { getClientByPhone: jest.fn() };
  const conv = { id: 'conv-1' };
  const convRepo  = {
    update:  jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn().mockResolvedValue(conv),
    save:    jest.fn().mockImplementation((c) => Promise.resolve({ id: 'conv-1', ...c })),
    create:  jest.fn().mockImplementation((c) => c),
    find:    jest.fn(),
  };
  const msgRepo   = { save: jest.fn().mockResolvedValue(undefined), create: jest.fn().mockImplementation((m) => m) };

  const ctrl = new AdminNotifyController(
    config as any, session as any, whatsapp as any, formatter as any,
    clientRepo as any, convRepo as any, msgRepo as any,
  );
  return { ctrl, session, whatsapp, formatter, clientRepo, convRepo, msgRepo };
}

describe('AdminNotifyController.notifyClient', () => {
  it('INSTALLATION_CANCELLED → avisa, limpia la instalación activa y persiste', async () => {
    const { ctrl, whatsapp, session, msgRepo } = build();
    const res = await ctrl.notifyClient({
      PhoneNumber: '59171000001', EventType: BotEventType.INSTALLATION_CANCELLED,
      Metadata: { Reason: 'sin técnicos', InstallationDate: '2026-08-01' },
    });
    expect(res).toEqual({ ok: true });
    expect(whatsapp.sendText).toHaveBeenCalledWith('71000001', expect.stringContaining('cancelada'));
    expect(session.updateSession).toHaveBeenCalledWith('71000001', { activeInstallationId: null });
    expect(msgRepo.save).toHaveBeenCalled();
  });

  it('INSTALLATION_CONFIRMATION → envía botones Confirmo/Reagendar', async () => {
    const { ctrl, whatsapp } = build();
    await ctrl.notifyClient({
      PhoneNumber: '59171000001', EventType: BotEventType.INSTALLATION_CONFIRMATION,
      Metadata: { Nombre: 'Ana', InstallationDate: 'mañana', Hora: '10:00' },
    });
    const [, , buttons] = whatsapp.sendButtons.mock.calls[0];
    expect(buttons.map((b: any) => b.id)).toEqual(['confirmar_instalacion', 'reagendar_si']);
  });

  it('INSTALLATION_CONFIRMATION → si sendButtons falla, degrada a texto plano', async () => {
    const { ctrl, whatsapp } = build();
    whatsapp.sendButtons.mockRejectedValueOnce(new Error('interactive no soportado'));
    await ctrl.notifyClient({
      PhoneNumber: '59171000001', EventType: BotEventType.INSTALLATION_CONFIRMATION,
      Metadata: { Nombre: 'Ana' },
    });
    expect(whatsapp.sendText).toHaveBeenCalledWith('71000001', expect.stringContaining('REAGENDAR'));
  });

  it('BOT_RESUME → desescala, limpia agente y avisa reanudación', async () => {
    const { ctrl, session, convRepo, whatsapp, formatter } = build();
    await ctrl.notifyClient({ PhoneNumber: '59171000001', EventType: BotEventType.BOT_RESUME });
    expect(session.deescalate).toHaveBeenCalledWith('71000001');
    expect(convRepo.update).toHaveBeenCalledWith({ phoneNumber: '71000001' }, { isEscalated: false, agentName: null });
    expect(whatsapp.sendText).toHaveBeenCalledWith('71000001', 'Bot reactivado.');
    expect(formatter.botResumed).toHaveBeenCalled();
  });

  it('CUSTOM_MESSAGE → envía el mensaje del agente con su etiqueta', async () => {
    const { ctrl, whatsapp, msgRepo } = build();
    await ctrl.notifyClient({
      PhoneNumber: '59171000001', EventType: BotEventType.CUSTOM_MESSAGE,
      AgentName: 'Carlos', Metadata: { Message: 'Ya revisé tu caso.' },
    });
    expect(whatsapp.sendText).toHaveBeenCalledWith('71000001', '*Carlos:* Ya revisé tu caso.');
    expect(msgRepo.save).toHaveBeenCalled();
  });

  it('CUSTOM_MESSAGE sin Message → no envía nada', async () => {
    const { ctrl, whatsapp } = build();
    await ctrl.notifyClient({ PhoneNumber: '59171000001', EventType: BotEventType.CUSTOM_MESSAGE, Metadata: {} });
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });

  it('EventType desconocido → responde ok sin romper', async () => {
    const { ctrl, whatsapp } = build();
    const res = await ctrl.notifyClient({ PhoneNumber: '71000001', EventType: 'NO_EXISTE' as any });
    expect(res).toEqual({ ok: true });
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });

  // ── D1 (2026-08-07): el backend mandaba el teléfono con prefijo "591" ──────
  // Esta normalización en la frontera es lo que impide que el bug vuelva:
  // aunque alguien del otro lado reintroduzca el prefijo, el chatbot resuelve
  // igual a la conversación y la sesión reales.
  describe('D1 — normalización del teléfono en la frontera', () => {
    it('acepta el formato con prefijo 591 y opera sobre el número canónico', async () => {
      const { ctrl, whatsapp, session } = build();

      await ctrl.notifyClient({
        PhoneNumber: '59171000001', EventType: BotEventType.BOT_RESUME,
      });

      expect(whatsapp.sendText).toHaveBeenCalledWith('71000001', expect.any(String));
      expect(session.deescalate).toHaveBeenCalledWith('71000001');
    });

    it('las dos formas del mismo número producen exactamente las mismas llamadas', async () => {
      const conPrefijo = build();
      await conPrefijo.ctrl.notifyClient({
        PhoneNumber: '59171000001', EventType: BotEventType.BOT_RESUME,
      });

      const sinPrefijo = build();
      await sinPrefijo.ctrl.notifyClient({
        PhoneNumber: '71000001', EventType: BotEventType.BOT_RESUME,
      });

      expect(conPrefijo.whatsapp.sendText.mock.calls)
        .toEqual(sinPrefijo.whatsapp.sendText.mock.calls);
      expect(conPrefijo.session.deescalate.mock.calls)
        .toEqual(sinPrefijo.session.deescalate.mock.calls);
    });

    it('invalidate-identity parchea la sesión canónica, no la del prefijo', async () => {
      const { ctrl, session } = build();

      await ctrl.invalidateIdentity({ Phone: '59171000001' });

      expect(session.patchSession).toHaveBeenCalledWith(
        '71000001', { identityVerifiedAt: null },
      );
    });

    it('un teléfono malformado se rechaza con 400 en vez de crear basura', async () => {
      const { ctrl, whatsapp } = build();

      await expect(
        ctrl.notifyClient({ PhoneNumber: 'no-es-un-telefono', EventType: BotEventType.BOT_RESUME }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(whatsapp.sendText).not.toHaveBeenCalled();
    });
  });
});

describe('AdminNotifyController.invalidateIdentity (2026-08-05)', () => {
  it('resetea identityVerifiedAt de la sesión de ese teléfono', async () => {
    const { ctrl, session } = build();
    const res = await ctrl.invalidateIdentity({ Phone: '59171000001' });

    expect(res).toEqual({ ok: true });
    expect(session.patchSession).toHaveBeenCalledWith(
      '71000001', { identityVerifiedAt: null },
    );
  });

  it('sin Phone → no toca la sesión, responde ok:false', async () => {
    const { ctrl, session } = build();
    const res = await ctrl.invalidateIdentity({ Phone: '' } as any);

    expect(res).toEqual({ ok: false });
    expect(session.patchSession).not.toHaveBeenCalled();
  });
});

describe('AdminNotifyController.backfillClientNames', () => {
  it('actualiza los que encuentra y cuenta los no encontrados', async () => {
    const { ctrl, clientRepo, convRepo } = build();
    convRepo.find.mockResolvedValue([
      { id: 'c1', phoneNumber: '71435981' },
      { id: 'c2', phoneNumber: '70000000' },
    ]);
    clientRepo.getClientByPhone
      .mockResolvedValueOnce({ Id: 'CID1', FullName: 'jhael' })
      .mockResolvedValueOnce(null);

    const res = await ctrl.backfillClientNames();

    expect(res).toEqual({ processed: 2, updated: 1, notFound: 1 });
    expect(convRepo.update).toHaveBeenCalledWith({ id: 'c1' }, { clientName: 'jhael', clientId: 'CID1' });
  });

  it('un error en un teléfono cuenta como notFound y no detiene el lote', async () => {
    const { ctrl, clientRepo, convRepo } = build();
    convRepo.find.mockResolvedValue([{ id: 'c1', phoneNumber: 'x' }, { id: 'c2', phoneNumber: 'y' }]);
    clientRepo.getClientByPhone
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ Id: 'CID2', FullName: 'Ana' });

    const res = await ctrl.backfillClientNames();
    expect(res).toEqual({ processed: 2, updated: 1, notFound: 1 });
  });
});
