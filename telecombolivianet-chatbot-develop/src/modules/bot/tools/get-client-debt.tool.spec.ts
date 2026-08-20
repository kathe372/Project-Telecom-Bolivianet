import { GetClientDebtTool } from './get-client-debt.tool';
import { buildClientSession } from '../../../test/factories/session.factory';


let invoiceSeq = 0;
const makeInvoice = (overrides: Record<string, unknown> = {}) => ({
  // La deduplicación es por Id (antes era por `Año-Mes`, lo que colapsaba la
  // mensualidad y la instalación del mismo mes y hacía desaparecer una de la deuda).
  Id:      `inv-${++invoiceSeq}`,
  Year:    2024,
  Month:   6,
  Amount:  100,
  Status:  'Pendiente',
  DueDate: '2024-06-30',
  ...overrides,
});

describe('GetClientDebtTool', () => {
  const clientRepo    = { getClientInvoices: jest.fn() };
  const sessionSvc    = { updateSession: jest.fn() };
  let tool: GetClientDebtTool;

  beforeEach(() => {
    jest.resetAllMocks();
    invoiceSeq = 0;
    sessionSvc.updateSession.mockResolvedValue(undefined);
    tool = new GetClientDebtTool(clientRepo as any, sessionSvc as any);
  });


  it('devuelve hasPendingDebt=false cuando no hay facturas pendientes', async () => {
    clientRepo.getClientInvoices.mockResolvedValue([]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.hasPendingDebt).toBe(false);
    expect(result.totalDebt).toBe(0);
  });

  it('actualiza totalDebt=0 en sesión cuando no hay deuda', async () => {
    clientRepo.getClientInvoices.mockResolvedValue([]);
    const session = buildClientSession({ phoneNumber: '59171000001' });

    await tool.execute({}, session);

    expect(sessionSvc.updateSession).toHaveBeenCalledWith('59171000001', { totalDebt: 0 });
  });


  it('suma el total de facturas Pendiente y Vencida', async () => {
    const invoices = [
      makeInvoice({ Year: 2024, Month: 1, Amount: 200, Status: 'Pendiente' }),
      makeInvoice({ Year: 2024, Month: 2, Amount: 150, Status: 'Vencida'   }),
    ];
    clientRepo.getClientInvoices.mockResolvedValue(invoices);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.hasPendingDebt).toBe(true);
    expect(result.totalDebt).toBe(350);
    expect(result.pendingCount).toBe(2);
  });

  it('filtra facturas Pagada / Anulada — no las incluye en el total', async () => {
    clientRepo.getClientInvoices.mockResolvedValueOnce([
      makeInvoice({ Status: 'Pagada',   Amount: 999 }),
      makeInvoice({ Status: 'Anulada',  Amount: 500, Month: 2 }),
      makeInvoice({ Status: 'Pendiente', Amount: 100, Month: 3 }),
    ]);
    clientRepo.getClientInvoices.mockResolvedValueOnce([]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.totalDebt).toBe(100);
    expect(result.pendingCount).toBe(1);
  });

  it('deduplica por Id la factura que devuelven ambas consultas de año', async () => {
    // El backend devuelve las facturas de instalación en CUALQUIER año, así que
    // la misma factura aparece en la consulta del año actual y en la del anterior.
    const instalacion = makeInvoice({ Id: 'inst-1', Year: 2023, Month: 11, Amount: 300 });
    clientRepo.getClientInvoices
      .mockResolvedValueOnce([instalacion, makeInvoice({ Year: 2024, Month: 6, Amount: 200 })])
      .mockResolvedValueOnce([instalacion]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.pendingCount).toBe(2);
    expect(result.totalDebt).toBe(500);
  });

  it('cuenta mensualidad e instalación del MISMO mes como dos deudas distintas', async () => {
    // REGRESIÓN: la clave de deduplicación era `Año-Mes`, así que una de las dos
    // facturas del mismo mes desaparecía silenciosamente del total adeudado.
    clientRepo.getClientInvoices.mockResolvedValueOnce([
      makeInvoice({ Id: 'mensual-1', Year: 2024, Month: 3, Amount: 149 }),
      makeInvoice({ Id: 'instal-1',  Year: 2024, Month: 3, Amount: 350 }),
    ]);
    clientRepo.getClientInvoices.mockResolvedValueOnce([]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.pendingCount).toBe(2);
    expect(result.totalDebt).toBe(499);
  });

  it('cuenta como deuda una factura recién generada (Emitida)', async () => {
    // REGRESIÓN: el filtro era `Pendiente | Vencida`. Como las facturas nacen en
    // Emitida y solo pasan a Vencida al vencer, del día 1 al 5 de cada mes el bot
    // respondía "el cliente está al día" y no enviaba el QR de pago.
    clientRepo.getClientInvoices.mockResolvedValueOnce([
      makeInvoice({ Status: 'Emitida', Amount: 149 }),
    ]);
    clientRepo.getClientInvoices.mockResolvedValueOnce([]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.hasPendingDebt).toBe(true);
    expect(result.totalDebt).toBe(149);
  });

  it('cuenta solo el saldo remanente de una factura ParcialmentePagada', async () => {
    clientRepo.getClientInvoices.mockResolvedValueOnce([
      makeInvoice({ Status: 'ParcialmentePagada', Amount: 149, AmountPaid: 50 }),
    ]);
    clientRepo.getClientInvoices.mockResolvedValueOnce([]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.hasPendingDebt).toBe(true);
    expect(result.totalDebt).toBe(99);
    expect(result.invoices[0].amount).toBe(99);
  });

  it('devuelve el período en español (ej: "Junio 2024")', async () => {
    clientRepo.getClientInvoices.mockResolvedValue([
      makeInvoice({ Year: 2024, Month: 6, Amount: 100, Status: 'Pendiente' }),
    ]);
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.invoices[0].period).toBe('Junio 2024');
  });

  it('actualiza totalDebt en sesión cuando hay deuda', async () => {
    clientRepo.getClientInvoices.mockResolvedValue([
      makeInvoice({ Amount: 300, Status: 'Vencida' }),
    ]);
    const session = buildClientSession({ phoneNumber: '59172000001' });

    await tool.execute({}, session);

    expect(sessionSvc.updateSession).toHaveBeenCalledWith('59172000001', { totalDebt: 300 });
  });


  it('consulta facturas del año actual y el anterior en paralelo', async () => {
    clientRepo.getClientInvoices.mockResolvedValue([]);
    const session = buildClientSession();

    await tool.execute({}, session);

    const currentYear = new Date().getFullYear();
    expect(clientRepo.getClientInvoices).toHaveBeenCalledWith(session.clientId, currentYear);
    expect(clientRepo.getClientInvoices).toHaveBeenCalledWith(session.clientId, currentYear - 1);
    expect(clientRepo.getClientInvoices).toHaveBeenCalledTimes(2);
  });


  it('devuelve objeto error si el repositorio lanza excepción', async () => {
    clientRepo.getClientInvoices.mockRejectedValue(new Error('DB timeout'));
    const session = buildClientSession();

    const result = await tool.execute({}, session) as any;

    expect(result.error).toContain('DB timeout');
  });


  it('getName devuelve "get_client_debt"', () => {
    expect(tool.getName()).toBe('get_client_debt');
  });

  it('requiresIdentification devuelve true', () => {
    expect(tool.requiresIdentification()).toBe(true);
  });
});
