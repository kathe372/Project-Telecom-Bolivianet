import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MonitorController } from './monitor.controller';

const CONV = {
  id: 'conv-1', phoneNumber: '71435981', clientId: 'C1', clientName: 'jhael',
  isEscalated: false, agentName: null, escalatedAt: null,
  createdAt: new Date(), updatedAt: new Date(),
};

function build() {
  const config  = { get: jest.fn() };
  const session = {
    escalate:   jest.fn().mockResolvedValue(undefined),
    deescalate: jest.fn().mockResolvedValue(undefined),
    getSession: jest.fn().mockResolvedValue({ isEscalated: false, pendingAction: null, activeTicketId: null, activeInstallationId: null, lastLocation: null }),
    addMessage: jest.fn().mockResolvedValue(undefined),
  };
  const whatsapp = { sendText: jest.fn().mockResolvedValue('wamid.1') };
  const convRepo = {
    findOne: jest.fn().mockResolvedValue({ ...CONV }),
    find:    jest.fn().mockResolvedValue([]),
    count:   jest.fn().mockResolvedValue(0),
    save:    jest.fn().mockImplementation((c) => Promise.resolve(c)),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    })),
  };
  const msgRepo = {
    find:   jest.fn().mockResolvedValue([]),
    save:   jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockImplementation((m) => ({ id: 'msg-1', ...m })),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0), getMany: jest.fn().mockResolvedValue([]),
      getRawMany: jest.fn().mockResolvedValue([]),
    })),
  };
  const getConversations = { execute: jest.fn().mockResolvedValue({ total: 0, page: 1, limit: 20, conversations: [] }) };
  const botMetrics = { getSummary: jest.fn().mockResolvedValue({ conversations: {}, messages: {}, topTools: [], latency: {} }) };
  const summaryJob = { runOnce: jest.fn().mockResolvedValue({ candidates: 3, summarized: 2 }) };
  const geminiErrorMetrics = {
    getStats: jest.fn().mockReturnValue({
      windowMinutes: 5, totalCalls: 0, errors: 0, errorRate: 0,
      byKind: { ok: 0, timeout: 0, '429': 0, other: 0 },
    }),
  };

  const ctrl = new MonitorController(
    config as any, session as any, whatsapp as any, convRepo as any, msgRepo as any,
    getConversations as any, botMetrics as any, summaryJob as any, geminiErrorMetrics as any,
  );
  return { ctrl, session, whatsapp, convRepo, msgRepo, getConversations, botMetrics, summaryJob, geminiErrorMetrics };
}

describe('MonitorController', () => {
  it('summarizeIdle delega en el job', async () => {
    const { ctrl, summaryJob } = build();
    expect(await ctrl.summarizeIdle()).toEqual({ candidates: 3, summarized: 2 });
    expect(summaryJob.runOnce).toHaveBeenCalled();
  });

  it('listConversations delega en el use-case con page/limit/tab', async () => {
    const { ctrl, getConversations } = build();
    await ctrl.listConversations(2, 10, 'escaladas');
    expect(getConversations.execute).toHaveBeenCalledWith({ tab: 'escaladas', page: 2, limit: 10 });
  });

  // P4.1 (auditoría 2026-08)
  describe('getGeminiHealth', () => {
    it('delega en GeminiErrorMetricsService con la ventana en ms', async () => {
      const { ctrl, geminiErrorMetrics } = build();
      await ctrl.getGeminiHealth(5);
      expect(geminiErrorMetrics.getStats).toHaveBeenCalledWith(5 * 60_000);
    });

    it('acota la ventana entre 1 y 15 minutos', async () => {
      const { ctrl, geminiErrorMetrics } = build();
      await ctrl.getGeminiHealth(999);
      expect(geminiErrorMetrics.getStats).toHaveBeenCalledWith(15 * 60_000);

      await ctrl.getGeminiHealth(0);
      expect(geminiErrorMetrics.getStats).toHaveBeenCalledWith(1 * 60_000);
    });
  });

  describe('takeoverConversation', () => {
    it('escala la conversación y la asigna al agente', async () => {
      const { ctrl, convRepo, session } = build();
      const res = await ctrl.takeoverConversation('71435981', { agentName: 'Carlos' });
      expect(convRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isEscalated: true, agentName: 'Carlos' }));
      expect(session.escalate).toHaveBeenCalledWith('71435981');
      expect(res).toEqual({ success: true, phoneNumber: '71435981', agentName: 'Carlos' });
    });
    it('sin agentName usa "Agente" por defecto', async () => {
      const { ctrl } = build();
      const res = await ctrl.takeoverConversation('71435981', {});
      expect(res.agentName).toBe('Agente');
    });
    it('conversación inexistente → 404', async () => {
      const { ctrl, convRepo } = build();
      convRepo.findOne.mockResolvedValue(null);
      await expect(ctrl.takeoverConversation('71999999', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('releaseConversation', () => {
    it('devuelve la conversación al bot', async () => {
      const { ctrl, convRepo, session } = build();
      const res = await ctrl.releaseConversation('71435981');
      expect(convRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isEscalated: false, agentName: null }));
      expect(session.deescalate).toHaveBeenCalledWith('71435981');
      expect(res).toEqual({ success: true, phoneNumber: '71435981' });
    });
    it('inexistente → 404', async () => {
      const { ctrl, convRepo } = build();
      convRepo.findOne.mockResolvedValue(null);
      await expect(ctrl.releaseConversation('71999999')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('sendAdminMessage', () => {
    it('envía, persiste el mensaje y lo agrega a la sesión', async () => {
      const { ctrl, whatsapp, msgRepo, session } = build();
      const res = await ctrl.sendAdminMessage('71435981', { text: '  hola  ' });
      expect(whatsapp.sendText).toHaveBeenCalledWith('71435981', 'hola');
      expect(msgRepo.save).toHaveBeenCalled();
      expect(session.addMessage).toHaveBeenCalledWith('71435981', 'admin', 'hola');
      expect(res.success).toBe(true);
    });
    it('texto vacío → 400', async () => {
      const { ctrl } = build();
      await expect(ctrl.sendAdminMessage('71435981', { text: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    });
    it('conversación inexistente → 404', async () => {
      const { ctrl, convRepo } = build();
      convRepo.findOne.mockResolvedValue(null);
      await expect(ctrl.sendAdminMessage('71999999', { text: 'hola' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── D1 (2026-08-07): ChatbotDirectNotifier del backend llamaba a estos
  // endpoints con el número prefijado ("59171435981"), que no es la clave con
  // la que se indexan las conversaciones ("71435981"). Resultado en
  // producción: 404, y las confirmaciones de pago nunca llegaban al cliente.
  describe('D1 — normalización del teléfono en la frontera', () => {
    it('getConversation resuelve igual con prefijo 591 que sin él', async () => {
      const { ctrl, convRepo } = build();

      await ctrl.getConversation('59171435981', 50);

      expect(convRepo.findOne).toHaveBeenCalledWith({ where: { phoneNumber: '71435981' } });
    });

    it('sendAdminMessage envía al número canónico', async () => {
      const { ctrl, whatsapp } = build();

      await ctrl.sendAdminMessage('59171435981', { text: 'hola' });

      expect(whatsapp.sendText).toHaveBeenCalledWith('71435981', 'hola');
    });

    it('takeover/release buscan por el número canónico', async () => {
      const t = build();
      await t.ctrl.takeoverConversation('59171435981', { agentName: 'Carlos' });
      expect(t.convRepo.findOne).toHaveBeenCalledWith({ where: { phoneNumber: '71435981' } });

      const r = build();
      await r.ctrl.releaseConversation('59171435981');
      expect(r.convRepo.findOne).toHaveBeenCalledWith({ where: { phoneNumber: '71435981' } });
    });

    it('un teléfono malformado se rechaza con 400 (no se busca nada)', async () => {
      const { ctrl, convRepo } = build();

      await expect(ctrl.getConversation('no-es-un-telefono', 50))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(convRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('getConversation', () => {
    it('inexistente → { found: false }', async () => {
      const { ctrl, convRepo } = build();
      convRepo.findOne.mockResolvedValue(null);
      expect(await ctrl.getConversation('71999999', 50)).toEqual({ found: false });
    });
    it('existente → found:true con conversación y liveSession', async () => {
      const { ctrl } = build();
      const res: any = await ctrl.getConversation('71435981', 50);
      expect(res.found).toBe(true);
      expect(res.conversation.phoneNumber).toBe('71435981');
      expect(res.liveSession).not.toBeNull();
    });
  });

  it('getStats agrega totales, hoy y métricas', async () => {
    const { ctrl, botMetrics } = build();
    const res: any = await ctrl.getStats(30);
    expect(res.total).toBeDefined();
    expect(res.today).toBeDefined();
    expect(botMetrics.getSummary).toHaveBeenCalledWith(30);
  });

  it('listEscalated con lista vacía → total 0', async () => {
    const { ctrl } = build();
    expect(await ctrl.listEscalated()).toEqual({ total: 0, conversations: [] });
  });
});
