import { PlanChangeEffectivityPolicy } from './plan-change-effectivity';

describe('PlanChangeEffectivityPolicy (BUG-5)', () => {
  let policy: PlanChangeEffectivityPolicy;

  beforeEach(() => {
    policy = new PlanChangeEffectivityPolicy();
  });

  it('upgrade (precio mayor) → inmediato', () => {
    expect(policy.resolve(149, 199)).toBe('inmediato');
  });

  it('downgrade (precio menor) → fin de mes', () => {
    expect(policy.resolve(199, 149)).toBe('fin_de_mes');
  });

  it('mismo precio → fin de mes (no es upgrade)', () => {
    expect(policy.resolve(149, 149)).toBe('fin_de_mes');
  });

  it('sin precios comparables → desconocido', () => {
    expect(policy.resolve(null, 199)).toBe('desconocido');
    expect(policy.resolve(149, null)).toBe('desconocido');
  });

  it('los mensajes reflejan la regla de negocio', () => {
    expect(policy.message('inmediato')).toContain('de inmediato');
    expect(policy.message('fin_de_mes')).toContain('1ro del mes siguiente');
    expect(policy.message('desconocido')).toContain('confirmará la fecha');
  });
});
