import { isValidPlanId } from './plan-id.validator';

describe('isValidPlanId', () => {
  it('acepta un UUID válido en minúsculas', () => {
    expect(isValidPlanId('00000000-0000-0000-0001-000000000002')).toBe(true);
  });

  it('acepta un UUID válido en mayúsculas (case-insensitive)', () => {
    expect(isValidPlanId('9F2A1C3B-4D5E-6F70-8192-A3B4C5D6E7F8')).toBe(true);
  });

  it('rechaza un placeholder inventado por el LLM', () => {
    expect(isValidPlanId('plan_platinium')).toBe(false);
  });

  it('rechaza un id casi válido pero con un segmento corto', () => {
    expect(isValidPlanId('00000000-0000-0000-0001-00000000000')).toBe(false);
  });

  it('rechaza vacío, null y undefined', () => {
    expect(isValidPlanId('')).toBe(false);
    expect(isValidPlanId(null)).toBe(false);
    expect(isValidPlanId(undefined)).toBe(false);
  });
});
