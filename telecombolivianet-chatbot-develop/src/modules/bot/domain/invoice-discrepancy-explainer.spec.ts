import { InvoiceDiscrepancyExplainer, InvoiceForComparison } from './invoice-discrepancy-explainer';

describe('InvoiceDiscrepancyExplainer', () => {
  let explainer: InvoiceDiscrepancyExplainer;

  beforeEach(() => {
    explainer = new InvoiceDiscrepancyExplainer();
  });

  const inv = (over: Partial<InvoiceForComparison> = {}): InvoiceForComparison => ({
    period: 'Mayo 2026', amount: 99, planName: 'Plan Cobre', notes: null, ...over,
  });

  it('monto igual → confirma que no hay diferencia', () => {
    const baseline = inv({ period: 'Abril 2026', amount: 99 });
    const target   = inv({ period: 'Mayo 2026', amount: 99 });

    const result = explainer.explain(baseline, target);

    expect(result.hasExplanation).toBe(true);
    expect(result.message).toContain('mismo importe');
  });

  it('planName distinto entre baseline y target → explica por cambio de plan, sin mirar Notes', () => {
    const baseline = inv({ period: 'Abril 2026', amount: 99, planName: 'Plan Cobre', notes: 'no debería usarse' });
    const target   = inv({ period: 'Mayo 2026', amount: 199, planName: 'Plan Platinium 1' });

    const result = explainer.explain(baseline, target);

    expect(result.hasExplanation).toBe(true);
    expect(result.message).toContain('Plan Platinium 1');
    expect(result.message).toContain('Plan Cobre');
    expect(result.message).toContain('cambio de plan');
    expect(result.message).not.toContain('no debería usarse');
  });

  it('mismo plan, hay Notes registrado → lo usa textualmente', () => {
    const baseline = inv({ period: 'Abril 2026', amount: 99 });
    const target   = inv({ period: 'Mayo 2026', amount: 105, notes: 'Ajuste manual por promoción vencida' });

    const result = explainer.explain(baseline, target);

    expect(result.hasExplanation).toBe(true);
    expect(result.message).toContain('Ajuste manual por promoción vencida');
  });

  it('mismo plan, sin Notes → NO inventa, responde que no hay motivo registrado y escala', () => {
    const baseline = inv({ period: 'Abril 2026', amount: 99 });
    const target   = inv({ period: 'Mayo 2026', amount: 100.94, notes: null });

    const result = explainer.explain(baseline, target);

    expect(result.hasExplanation).toBe(false);
    expect(result.message).toContain('No encuentro un motivo registrado');
    expect(result.message).not.toMatch(/IVA|impuesto|mora/i);
  });

  it('planName presente en ambas pero además hay Notes → prioriza la explicación del cambio de plan', () => {
    const baseline = inv({ period: 'Abril 2026', amount: 99, planName: 'Plan Cobre' });
    const target   = inv({
      period: 'Mayo 2026', amount: 199, planName: 'Plan Platinium 1',
      notes: 'Nota que no debería aparecer primero',
    });

    const result = explainer.explain(baseline, target);

    expect(result.message).toContain('cambio de plan');
    expect(result.message).not.toContain('Nota que no debería aparecer primero');
  });

  it('sin planName en alguna de las dos facturas (dato viejo) → no explica por plan, cae a Notes o a "sin motivo"', () => {
    const baseline = inv({ period: 'Abril 2026', amount: 99, planName: null });
    const target   = inv({ period: 'Mayo 2026', amount: 150, planName: 'Plan Platinium 1', notes: null });

    const result = explainer.explain(baseline, target);

    expect(result.hasExplanation).toBe(false);
    expect(result.message).not.toContain('cambio de plan');
  });
});
