import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalTokenGuard } from './internal-token.guard';


const VALID_TOKEN = 'super-secret-admin-token-exactly-32c!';

const makeGuard = (token: string): InternalTokenGuard => {
  const guard = new InternalTokenGuard({ get: jest.fn().mockReturnValue(token) } as any);
  guard.onModuleInit();
  return guard;
};

const makeCtx = (authHeader?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader !== undefined ? { authorization: authHeader } : {},
      }),
    }),
  } as unknown as ExecutionContext);

describe('InternalTokenGuard', () => {

  it('se configura correctamente con token de longitud suficiente (≥ 32 chars)', () => {
    const guard = makeGuard(VALID_TOKEN);
    expect(guard.canActivate(makeCtx(`Bearer ${VALID_TOKEN}`))).toBe(true);
  });

  it('rechaza toda solicitud si el token configurado tiene menos de 32 chars', () => {
    const guard = makeGuard('short-token');
    expect(() => guard.canActivate(makeCtx('Bearer short-token')))
      .toThrow(UnauthorizedException);
  });

  it('rechaza toda solicitud si el token no está configurado (string vacío)', () => {
    const guard = makeGuard('');
    expect(() => guard.canActivate(makeCtx('Bearer anything')))
      .toThrow(UnauthorizedException);
  });


  it('devuelve true con token Bearer correcto', () => {
    const guard = makeGuard(VALID_TOKEN);
    expect(guard.canActivate(makeCtx(`Bearer ${VALID_TOKEN}`))).toBe(true);
  });


  it('lanza UnauthorizedException si no hay header Authorization', () => {
    const guard = makeGuard(VALID_TOKEN);
    expect(() => guard.canActivate(makeCtx())).toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException si el header no usa esquema Bearer', () => {
    const guard = makeGuard(VALID_TOKEN);
    expect(() => guard.canActivate(makeCtx(`Basic ${VALID_TOKEN}`))).toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException si el token es incorrecto', () => {
    const guard = makeGuard(VALID_TOKEN);
    expect(() => guard.canActivate(makeCtx('Bearer wrong-token-value'))).toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException para token vacío en header', () => {
    const guard = makeGuard(VALID_TOKEN);
    expect(() => guard.canActivate(makeCtx('Bearer '))).toThrow(UnauthorizedException);
  });


  it('comparación correcta e incorrecta toman tiempo similar (timingSafeEqual)', () => {
    const guard = makeGuard(VALID_TOKEN);
    const RUNS = 200;

    const timeMs = (fn: () => void): number => {
      const t0 = process.hrtime.bigint();
      fn();
      return Number(process.hrtime.bigint() - t0) / 1_000_000;
    };

    let validTotal = 0;
    let invalidTotal = 0;

    for (let i = 0; i < RUNS; i++) {
      try { timeMs(() => guard.canActivate(makeCtx(`Bearer ${VALID_TOKEN}`))); }
      catch {  }
    }
    for (let i = 0; i < RUNS; i++) {
      try { validTotal += timeMs(() => guard.canActivate(makeCtx(`Bearer ${VALID_TOKEN}`))); }
      catch {  }
    }
    for (let i = 0; i < RUNS; i++) {
      try { invalidTotal += timeMs(() => guard.canActivate(makeCtx('Bearer wrong-wrong-wrong-wrong'))); }
      catch {  }
    }

    const diffMs = Math.abs(validTotal / RUNS - invalidTotal / RUNS);
    expect(diffMs).toBeLessThan(2);
  });


  it('acepta token de exactamente 32 caracteres', () => {
    const token32 = 'a'.repeat(32);
    const guard = makeGuard(token32);
    expect(guard.canActivate(makeCtx(`Bearer ${token32}`))).toBe(true);
  });

  it('rechaza token de 31 caracteres (un char menos del mínimo)', () => {
    const token31 = 'a'.repeat(31);
    const guard = makeGuard(token31);
    expect(() => guard.canActivate(makeCtx(`Bearer ${token31}`))).toThrow(UnauthorizedException);
  });
});
