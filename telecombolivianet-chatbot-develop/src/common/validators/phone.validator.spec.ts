import { validatePhone, assertValidPhone } from './phone.validator';

describe('validatePhone', () => {
  it('acepta un número boliviano y quita el prefijo 591', () => {
    const r = validatePhone('59171435981');
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe('71435981');
  });

  it('acepta un número sin prefijo tal cual', () => {
    expect(validatePhone('71435981')).toEqual({ valid: true, normalized: '71435981' });
  });

  it('limpia espacios, +, guiones y paréntesis', () => {
    expect(validatePhone('+591 (7) 143-5981').normalized).toBe('71435981');
  });

  it('rechaza vacío o no-string', () => {
    expect(validatePhone('').valid).toBe(false);
    expect(validatePhone(null as any).valid).toBe(false);
  });

  it('rechaza formato no numérico', () => {
    expect(validatePhone('abc123$$').valid).toBe(false);
  });

  it('rechaza longitud fuera de 7-15 dígitos', () => {
    expect(validatePhone('123').valid).toBe(false);
    expect(validatePhone('1234567890123456').valid).toBe(false);
  });

  it('no quita el 591 si el resto es demasiado corto', () => {
    // 591 + 5 dígitos = no cumple len > 591.length+6
    expect(validatePhone('59112345').normalized).toBe('59112345');
  });
});

describe('assertValidPhone', () => {
  it('devuelve el normalizado si es válido', () => {
    expect(assertValidPhone('59171435981')).toBe('71435981');
  });
  it('lanza si es inválido', () => {
    expect(() => assertValidPhone('xx')).toThrow();
  });
});
