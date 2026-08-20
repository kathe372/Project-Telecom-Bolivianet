import { WhatsappOutboxService } from './whatsapp-outbox.service';

function build() {
  const outboxRepo = {
    markAsProcessing:  jest.fn(),
    get:               jest.fn(),
    remove:            jest.fn().mockResolvedValue(undefined),
    revertToPending:   jest.fn().mockResolvedValue(undefined),
    incrementAttempts: jest.fn().mockResolvedValue(undefined),
    getAllPhones:      jest.fn().mockResolvedValue([]),
  };
  const whatsapp = { sendText: jest.fn().mockResolvedValue('id') };
  const svc = new WhatsappOutboxService(outboxRepo as any, whatsapp as any);
  return { svc, outboxRepo, whatsapp };
}

const ENTRY = { text: 'pendiente', attempts: 0, addedAt: Date.now() };

describe('WhatsappOutboxService.tryDeliverPending', () => {
  it('con lock y entrada → entrega y remueve', async () => {
    const { svc, outboxRepo, whatsapp } = build();
    outboxRepo.markAsProcessing.mockResolvedValue(true);
    outboxRepo.get.mockResolvedValue(ENTRY);
    await svc.tryDeliverPending('P');
    expect(whatsapp.sendText).toHaveBeenCalledWith('P', 'pendiente');
    expect(outboxRepo.remove).toHaveBeenCalledWith('P');
  });

  it('R2: lock PRIMERO — si no adquiere, NO envía (evita doble envío)', async () => {
    const { svc, outboxRepo, whatsapp } = build();
    outboxRepo.markAsProcessing.mockResolvedValue(false);
    await svc.tryDeliverPending('P');
    expect(outboxRepo.get).not.toHaveBeenCalled();
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });

  it('R2: lock adquirido pero otro ya la entregó (entry null) → libera el lock, no envía', async () => {
    const { svc, outboxRepo, whatsapp } = build();
    outboxRepo.markAsProcessing.mockResolvedValue(true);
    outboxRepo.get.mockResolvedValue(null);
    await svc.tryDeliverPending('P');
    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(outboxRepo.revertToPending).toHaveBeenCalledWith('P');
  });

  it('si el envío falla → revierte a pendiente (no pierde el mensaje)', async () => {
    const { svc, outboxRepo, whatsapp } = build();
    outboxRepo.markAsProcessing.mockResolvedValue(true);
    outboxRepo.get.mockResolvedValue(ENTRY);
    whatsapp.sendText.mockRejectedValue(new Error('WA caído'));
    await svc.tryDeliverPending('P');
    expect(outboxRepo.revertToPending).toHaveBeenCalledWith('P');
    expect(outboxRepo.remove).not.toHaveBeenCalled();
  });
});

describe('WhatsappOutboxService.retryOutbox (cron)', () => {
  it('sin pendientes → no hace nada', async () => {
    const { svc, whatsapp } = build();
    await svc.retryOutbox();
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });

  it('entrega los pendientes válidos', async () => {
    const { svc, outboxRepo, whatsapp } = build();
    outboxRepo.getAllPhones.mockResolvedValue(['P']);
    outboxRepo.markAsProcessing.mockResolvedValue(true);
    outboxRepo.get.mockResolvedValue({ text: 'x', attempts: 1, addedAt: Date.now() });
    await svc.retryOutbox();
    expect(whatsapp.sendText).toHaveBeenCalledWith('P', 'x');
    expect(outboxRepo.remove).toHaveBeenCalledWith('P');
  });

  it('descarta la entrada que superó el máximo de intentos (sin enviar)', async () => {
    const { svc, outboxRepo, whatsapp } = build();
    outboxRepo.getAllPhones.mockResolvedValue(['P']);
    outboxRepo.markAsProcessing.mockResolvedValue(true);
    outboxRepo.get.mockResolvedValue({ text: 'x', attempts: 5, addedAt: Date.now() });
    await svc.retryOutbox();
    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(outboxRepo.remove).toHaveBeenCalledWith('P');
  });

  it('si el envío falla → revierte e incrementa intentos', async () => {
    const { svc, outboxRepo, whatsapp } = build();
    outboxRepo.getAllPhones.mockResolvedValue(['P']);
    outboxRepo.markAsProcessing.mockResolvedValue(true);
    outboxRepo.get.mockResolvedValue({ text: 'x', attempts: 1, addedAt: Date.now() });
    whatsapp.sendText.mockRejectedValue(new Error('WA caído'));
    await svc.retryOutbox();
    expect(outboxRepo.revertToPending).toHaveBeenCalledWith('P');
    expect(outboxRepo.incrementAttempts).toHaveBeenCalledWith('P');
  });

  it('no corre en paralelo consigo mismo (guard cronRunning)', async () => {
    const { svc, outboxRepo } = build();
    (svc as any).cronRunning = true;
    await svc.retryOutbox();
    expect(outboxRepo.getAllPhones).not.toHaveBeenCalled();
  });
});
