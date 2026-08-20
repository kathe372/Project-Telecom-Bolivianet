import { maskPhone, structLog } from './log.util';

describe('maskPhone (protección de PII en logs)', () => {
  it('enmascara dejando 3 primeros y 2 últimos', () => {
    expect(maskPhone('59171435981')).toBe('591****81');
  });
  it('números muy cortos → ***', () => {
    expect(maskPhone('123')).toBe('***');
    expect(maskPhone('12345')).toBe('***');
  });
  it('null/undefined/vacío → ***', () => {
    expect(maskPhone(null)).toBe('***');
    expect(maskPhone(undefined)).toBe('***');
    expect(maskPhone('')).toBe('***');
  });
});

describe('structLog', () => {
  it('serializa event + campos a JSON', () => {
    expect(structLog('login', { user: 'bot' })).toBe('{"event":"login","user":"bot"}');
  });
  it('sin campos → solo event', () => {
    expect(structLog('ping')).toBe('{"event":"ping"}');
  });
});
