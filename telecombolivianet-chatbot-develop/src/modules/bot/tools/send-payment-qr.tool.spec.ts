import { MessageFormatterService } from '../message-formatter.service';
import { SendPaymentQrTool } from './send-payment-qr.tool';
import { buildClientSession } from '../../../test/factories/session.factory';


describe('SendPaymentQrTool', () => {
  const config       = { get: jest.fn() };
  const clientRepo   = { getPendingInvoices: jest.fn() };
  const paymentRepo  = { getCompanyQrBuffer: jest.fn() };
  const whatsapp     = { sendText: jest.fn(), sendImage: jest.fn() };
  const mediaStorage = { saveMedia: jest.fn() };
  const sessionService = { claimOnce: jest.fn() };
  let tool: SendPaymentQrTool;

  beforeEach(() => {
    jest.resetAllMocks();
    whatsapp.sendText.mockResolvedValue(undefined);
    whatsapp.sendImage.mockResolvedValue(undefined);
    mediaStorage.saveMedia.mockResolvedValue('https://cdn.example.com/qr.png');
    paymentRepo.getCompanyQrBuffer.mockResolvedValue(Buffer.from('fake-qr'));
    sessionService.claimOnce.mockResolvedValue(true); // por defecto: no deduplicado
    config.get.mockImplementation((key: string) =>
      key === 'storage.publicUrl' ? 'https://cdn.example.com' : undefined,
    );

    tool = new SendPaymentQrTool(
      config as any,
      clientRepo as any,
      paymentRepo as any,
      whatsapp as any,
      mediaStorage as any,
      new MessageFormatterService(),
      sessionService as any,
    );
  });


  it('envía mensaje "no tienes deuda" y devuelve noDebt=true cuando deuda=0', async () => {
    clientRepo.getPendingInvoices.mockResolvedValue([]);
    const session = buildClientSession({ clientName: 'Ana Quispe' });

    const result = await tool.execute({}, session) as any;

    expect(result.sent).toBe(false);
    expect(result.noDebt).toBe(true);
    expect(whatsapp.sendText).toHaveBeenCalledWith(
      session.phoneNumber,
      expect.stringContaining('no tienes deuda pendiente'),
    );
    expect(whatsapp.sendImage).not.toHaveBeenCalled();
  });


  it('envía imagen QR y devuelve sent=true cuando hay deuda pendiente', async () => {
    clientRepo.getPendingInvoices.mockResolvedValue([
      { Amount: 150, Status: 'Pendiente' },
      { Amount: 50,  Status: 'Pendiente' },
    ]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.sent).toBe(true);
    expect(result.totalDebt).toBe(200);
    expect(whatsapp.sendImage).toHaveBeenCalledWith(
      session.phoneNumber,
      'https://cdn.example.com/qr.png',
      expect.stringContaining('Bs. 200.00'),
    );
  });

  it('PASO 1: factura ParcialmentePagada — usa el saldo pendiente, no el importe original', async () => {
    clientRepo.getPendingInvoices.mockResolvedValue([
      { Amount: 149, AmountPaid: 50, Status: 'ParcialmentePagada' },
    ]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.sent).toBe(true);
    expect(result.totalDebt).toBe(99);
  });

  it('PASO 1: mezcla de facturas Pendiente + ParcialmentePagada suma solo el saldo real de cada una', async () => {
    clientRepo.getPendingInvoices.mockResolvedValue([
      { Amount: 100, Status: 'Pendiente' },
      { Amount: 149, AmountPaid: 50, Status: 'ParcialmentePagada' },
      { Amount: 300, Status: 'Pagada' }, // ya pagada — no debe sumar nada
    ]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    // 100 (Pendiente) + 99 (149 - 50, ParcialmentePagada) + 0 (Pagada) = 199
    expect(result.totalDebt).toBe(199);
  });

  it('usa session.totalDebt como fallback cuando clientRepo falla', async () => {
    clientRepo.getPendingInvoices.mockRejectedValue(new Error('timeout'));
    const session = buildClientSession({ totalDebt: 300 });

    const result = await tool.execute({}, session) as any;

    expect(result.sent).toBe(true);
    expect(result.totalDebt).toBe(300);
  });


  it('BUG-6: sin STORAGE_PUBLIC_URL degrada a instrucciones de pago por TEXTO', async () => {
    clientRepo.getPendingInvoices.mockResolvedValue([{ Amount: 100, Status: 'Pendiente' }]);
    config.get.mockReturnValue('');

    const result = await tool.execute({}, buildClientSession()) as any;

    expect(result.sent).toBe(true);
    expect(result.qrImage).toBe(false);
    expect(whatsapp.sendImage).not.toHaveBeenCalled();
    expect(whatsapp.sendText).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('100.00'),
    );
  });


  it('devuelve sent=false con mensaje amable cuando el QR devuelve 404', async () => {
    clientRepo.getPendingInvoices.mockResolvedValue([{ Amount: 100, Status: 'Pendiente' }]);
    const err = Object.assign(new Error('Not Found'), { response: { status: 404 } });
    paymentRepo.getCompanyQrBuffer.mockRejectedValue(err);

    const result = await tool.execute({}, buildClientSession()) as any;

    expect(result.sent).toBe(false);
    expect(result.reason).toContain('no está configurado');
    expect(whatsapp.sendImage).not.toHaveBeenCalled();
  });


  it('BUG-6: ante excepción inesperada degrada a instrucciones de pago por TEXTO', async () => {
    clientRepo.getPendingInvoices.mockResolvedValue([{ Amount: 100, Status: 'Pendiente' }]);
    paymentRepo.getCompanyQrBuffer.mockRejectedValue(new Error('S3 error'));

    const result = await tool.execute({}, buildClientSession()) as any;

    expect(result.sent).toBe(true);
    expect(result.qrImage).toBe(false);
    expect(whatsapp.sendText).toHaveBeenCalled();
  });


  it('el caption incluye el saldo pendiente e instrucción de verificación del pago', async () => {
    clientRepo.getPendingInvoices.mockResolvedValue([{ Amount: 75.5, Status: 'Pendiente' }]);

    await tool.execute({}, buildClientSession());

    const [, , caption] = (whatsapp.sendImage as jest.Mock).mock.calls[0];
    expect(caption).toContain('75.50');
    expect(caption).toContain('verificará');
  });


  it('BUG-03: si claimOnce devuelve false (ya enviado <45s) → deduped, sin enviar', async () => {
    sessionService.claimOnce.mockResolvedValue(false);
    clientRepo.getPendingInvoices.mockResolvedValue([{ Amount: 100, Status: 'Pendiente' }]);

    const result = await tool.execute({}, buildClientSession()) as any;

    expect(result.deduped).toBe(true);
    expect(result.sent).toBe(false);
    expect(whatsapp.sendImage).not.toHaveBeenCalled();
    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(clientRepo.getPendingInvoices).not.toHaveBeenCalled(); // ni siquiera consulta deuda
    // PASO 3: deduplicado = _noOp, nunca _mediaDelivered — no debe apagar el turno completo.
    expect(result._noOp).toBe(true);
    expect(result._mediaDelivered).toBeUndefined();
  });

  it('PASO 3: sin deuda → _noOp (no se entregó contenido, no debe apagar el turno)', async () => {
    clientRepo.getPendingInvoices.mockResolvedValue([]);

    const result = await tool.execute({}, buildClientSession()) as any;

    expect(result._noOp).toBe(true);
    expect(result._mediaDelivered).toBeUndefined();
  });

  it('PASO 3: imagen QR entregada → _mediaDelivered (sí debe apagar el turno)', async () => {
    clientRepo.getPendingInvoices.mockResolvedValue([{ Amount: 100, Status: 'Pendiente' }]);

    const result = await tool.execute({}, buildClientSession()) as any;

    expect(result._mediaDelivered).toBe(true);
    expect(result._noOp).toBeUndefined();
  });

  it('PASO 3: fallback textual entregado → _mediaDelivered (sí debe apagar el turno)', async () => {
    clientRepo.getPendingInvoices.mockResolvedValue([{ Amount: 100, Status: 'Pendiente' }]);
    config.get.mockReturnValue('');

    const result = await tool.execute({}, buildClientSession()) as any;

    expect(result._mediaDelivered).toBe(true);
    expect(result._noOp).toBeUndefined();
  });

  it('BUG-03: reclama el candado con clave por teléfono y TTL 45s', async () => {
    clientRepo.getPendingInvoices.mockResolvedValue([{ Amount: 100, Status: 'Pendiente' }]);
    const session = buildClientSession();

    await tool.execute({}, session);

    expect(sessionService.claimOnce).toHaveBeenCalledWith(`qr:${session.phoneNumber}`, 45);
  });

  it('getName devuelve "send_payment_qr"', () => {
    expect(tool.getName()).toBe('send_payment_qr');
  });

  it('requiresIdentification devuelve true', () => {
    expect(tool.requiresIdentification()).toBe(true);
  });
});
