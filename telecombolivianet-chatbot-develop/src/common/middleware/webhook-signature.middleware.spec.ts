import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { WebhookSignatureMiddleware } from './webhook-signature.middleware';

/**
 * El orden entre autenticar y contar.
 *
 * La prueba que de verdad importa es la última: que el middleware CORTE la
 * cadena cuando la firma no es válida. Si dejara pasar, el limitador de tasa
 * —que va detrás— volvería a tocar Redis y a disparar envíos con datos que
 * nadie autenticó.
 */
describe('WebhookSignatureMiddleware', () => {
  const SECRETO = 'secreto-de-prueba';
  const CUERPO = Buffer.from(JSON.stringify({ entry: [] }));

  const firmaValida = () =>
    'sha256=' + createHmac('sha256', SECRETO).update(CUERPO).digest('hex');

  // `null` y no `undefined`: pasar undefined activaria el valor por defecto
  // del parametro y la prueba comprobaria justo lo contrario de lo que dice.
  function montar(secreto: string | null = SECRETO) {
    const config = { get: jest.fn().mockReturnValue(secreto ?? undefined) } as unknown as ConfigService;
    const res = {
      status: jest.fn().mockReturnThis(),
      json:   jest.fn().mockReturnThis(),
    } as any;
    const next = jest.fn();
    return { mw: new WebhookSignatureMiddleware(config), res, next };
  }

  const peticion = (firma?: string) =>
    ({ rawBody: CUERPO, headers: firma ? { 'x-hub-signature-256': firma } : {} }) as any;

  it('deja pasar una firma válida', () => {
    const { mw, res, next } = montar();
    mw.use(peticion(firmaValida()), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('sin firma responde 401 y NO continúa', () => {
    const { mw, res, next } = montar();
    mw.use(peticion(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('con firma inválida responde 200 silencioso y NO continúa', () => {
    // 200 es deliberado: un error haría que Meta reintentara en bucle.
    // Lo que no puede pasar es que continúe.
    const { mw, res, next } = montar();
    mw.use(peticion('sha256=' + '0'.repeat(64)), res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('una firma de longitud distinta no rompe la comparación', () => {
    const { mw, res, next } = montar();
    mw.use(peticion('sha256=corta'), res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('sin META_APP_SECRET falla cerrado', () => {
    const { mw, res, next } = montar(null);
    mw.use(peticion(firmaValida()), res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
