import { PerTurnToolCache } from './per-turn-tool-cache';

describe('PerTurnToolCache', () => {
  it('isCacheable → true solo para herramientas de solo lectura', () => {
    const c = new PerTurnToolCache();
    expect(c.isCacheable('get_available_plans')).toBe(true);
    expect(c.isCacheable('get_installation_slots')).toBe(true);
    expect(c.isCacheable('check_coverage')).toBe(true);
    expect(c.isCacheable('create_support_ticket')).toBe(false);
  });

  it('set/get devuelve el resultado cacheado para los mismos args', () => {
    const c = new PerTurnToolCache();
    const result = [{ Id: 'p1' }];
    c.set('get_available_plans', {}, result);
    expect(c.get('get_available_plans', {})).toBe(result);
  });

  it('args distintos → entradas distintas (miss)', () => {
    const c = new PerTurnToolCache();
    c.set('get_installation_slots', { dias: 7 }, ['a']);
    expect(c.get('get_installation_slots', { dias: 14 })).toBeUndefined();
    expect(c.get('get_installation_slots', { dias: 7 })).toEqual(['a']);
  });

  it('args undefined se normaliza a {} en la clave', () => {
    const c = new PerTurnToolCache();
    c.set('check_coverage', undefined as any, 'ok');
    expect(c.get('check_coverage', {} as any)).toBe('ok');
  });
});
