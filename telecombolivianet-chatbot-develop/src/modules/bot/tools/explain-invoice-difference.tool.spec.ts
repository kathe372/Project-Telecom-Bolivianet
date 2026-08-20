import { ExplainInvoiceDifferenceTool } from './explain-invoice-difference.tool';
import { InvoiceDiscrepancyExplainer } from '../domain/invoice-discrepancy-explainer';
import { buildClientSession } from '../../../test/factories/session.factory';

describe('ExplainInvoiceDifferenceTool', () => {
  const clientRepo = { getClientInvoices: jest.fn() };
  let tool: ExplainInvoiceDifferenceTool;

  beforeEach(() => {
    jest.resetAllMocks();
    tool = new ExplainInvoiceDifferenceTool(clientRepo as any, new InvoiceDiscrepancyExplainer());
  });

  const invoice = (over: Record<string, unknown> = {}) => ({
    Id: `inv-${Math.random()}`, Amount: 99, AmountPaid: 0, Status: 'Pendiente',
    DueDate: '2026-05-05', PaidAt: null, Notes: null, PlanName: 'Plan Cobre',
    ...over,
  });

  it('sin periodo_base explícito, usa el mes calendario anterior por defecto', async () => {
    clientRepo.getClientInvoices.mockResolvedValue([
      invoice({ Year: 2026, Month: 4, Amount: 99, PlanName: 'Plan Cobre' }),
      invoice({ Year: 2026, Month: 5, Amount: 99, PlanName: 'Plan Cobre' }),
    ]);

    const result = await tool.execute({ periodo_a_explicar: '2026-05' }, buildClientSession()) as any;

    expect(clientRepo.getClientInvoices).toHaveBeenCalledWith(expect.anything(), 2026);
    expect(result.explained).toBe(true);
    expect(result.message).toContain('mismo importe');
  });

  it('con periodo_base explícito, compara contra ese mes en vez del anterior', async () => {
    clientRepo.getClientInvoices.mockResolvedValue([
      invoice({ Year: 2026, Month: 1, Amount: 99, PlanName: 'Plan Cobre' }),
      invoice({ Year: 2026, Month: 4, Amount: 199, PlanName: 'Plan Platinium 1' }),
      invoice({ Year: 2026, Month: 5, Amount: 199, PlanName: 'Plan Platinium 1' }),
    ]);

    const result = await tool.execute(
      { periodo_a_explicar: '2026-05', periodo_base: '2026-01' }, buildClientSession(),
    ) as any;

    expect(result.explained).toBe(true);
    expect(result.message).toContain('cambio de plan');
  });

  it('periodo_a_explicar en enero → consulta también el año anterior para el baseline de diciembre', async () => {
    clientRepo.getClientInvoices.mockResolvedValue([]);

    await tool.execute({ periodo_a_explicar: '2026-01' }, buildClientSession());

    expect(clientRepo.getClientInvoices).toHaveBeenCalledWith(expect.anything(), 2026);
    expect(clientRepo.getClientInvoices).toHaveBeenCalledWith(expect.anything(), 2025);
  });

  it('formato de periodo_a_explicar inválido → error, no consulta el backend', async () => {
    const result = await tool.execute({ periodo_a_explicar: '05-2026' }, buildClientSession()) as any;

    expect(result.explained).toBe(false);
    expect(result.error).toContain('YYYY-MM');
    expect(clientRepo.getClientInvoices).not.toHaveBeenCalled();
  });

  it('no encuentra la factura del período a explicar → mensaje honesto, no inventa', async () => {
    clientRepo.getClientInvoices.mockResolvedValue([
      invoice({ Year: 2026, Month: 4, Amount: 99 }),
    ]);

    const result = await tool.execute({ periodo_a_explicar: '2026-05' }, buildClientSession()) as any;

    expect(result.explained).toBe(false);
    expect(result.message).toContain('No encuentro una factura de Mayo 2026');
  });

  it('no encuentra la factura base → mensaje honesto, no inventa', async () => {
    clientRepo.getClientInvoices.mockResolvedValue([
      invoice({ Year: 2026, Month: 5, Amount: 99 }),
    ]);

    const result = await tool.execute({ periodo_a_explicar: '2026-05' }, buildClientSession()) as any;

    expect(result.explained).toBe(false);
    expect(result.message).toContain('No encuentro una factura de Abril 2026');
  });

  it('mismo plan, sin Notes → NO inventa una razón (cierra el bug real del IVA)', async () => {
    clientRepo.getClientInvoices.mockResolvedValue([
      invoice({ Year: 2026, Month: 4, Amount: 99, PlanName: 'Plan Cobre', Notes: null }),
      invoice({ Year: 2026, Month: 5, Amount: 100.94, PlanName: 'Plan Cobre', Notes: null }),
    ]);

    const result = await tool.execute({ periodo_a_explicar: '2026-05' }, buildClientSession()) as any;

    expect(result.explained).toBe(false);
    expect(result.message).toContain('No encuentro un motivo registrado');
    expect(result.message).not.toMatch(/IVA|impuesto|mora/i);
  });

  it('mismo plan, con Notes → usa el motivo registrado', async () => {
    clientRepo.getClientInvoices.mockResolvedValue([
      invoice({ Year: 2026, Month: 4, Amount: 99, PlanName: 'Plan Cobre' }),
      invoice({ Year: 2026, Month: 5, Amount: 105, PlanName: 'Plan Cobre', Notes: 'Mes proporcional: 25 de 30 días' }),
    ]);

    const result = await tool.execute({ periodo_a_explicar: '2026-05' }, buildClientSession()) as any;

    expect(result.explained).toBe(true);
    expect(result.message).toContain('Mes proporcional');
  });

  it('error del repositorio → explained=false con mensaje descriptivo', async () => {
    clientRepo.getClientInvoices.mockRejectedValue(new Error('timeout'));

    const result = await tool.execute({ periodo_a_explicar: '2026-05' }, buildClientSession()) as any;

    expect(result.explained).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('getName devuelve "explain_invoice_difference"', () => {
    expect(tool.getName()).toBe('explain_invoice_difference');
  });

  it('requiresIdentification devuelve true', () => {
    expect(tool.requiresIdentification()).toBe(true);
  });
});
