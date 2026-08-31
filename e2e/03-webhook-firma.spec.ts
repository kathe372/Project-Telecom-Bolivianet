import { test, expect, request as apiRequest } from '@playwright/test';
import { execFileSync } from 'child_process';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * El webhook de WhatsApp, frente a peticiones sin firma.
 *
 * La firma se verifica DENTRO del método del controlador. En NestJS el
 * middleware corre antes que el controlador, así que `PhoneRateLimiterMiddleware`
 * leía el teléfono de un cuerpo no autenticado, lo contaba en Redis y —al pasar
 * del límite— mandaba un WhatsApp real a ese número.
 *
 * Dos consecuencias, ambas explotables sin credencial alguna:
 *   1. Envenenar el contador de un cliente real para que sus mensajes
 *      legítimos reciban 429.
 *   2. Hacer que el número verificado de la empresa escriba a cualquier
 *      teléfono que el atacante elija.
 *
 * Estas pruebas fijan el comportamiento correcto: sin firma válida, el sistema
 * no debe hacer NADA salvo rechazar. Y la última fija lo contrario, que importa
 * igual: con firma válida, sí debe procesar.
 */

const CHATBOT = 'http://localhost:3001';
const TELEFONO = '59100000001';          // inexistente, para no tocar a nadie real

function lineaEnv(clave: string): string {
  const env = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  const linea = env.split(/\r?\n/).find(l => l.startsWith(clave + '='));
  return linea ? linea.slice(clave.length + 1).trim() : '';
}

function redis(...args: string[]): string {
  return execFileSync('docker', [
    'exec', 'bolivianet-redis', 'redis-cli',
    '-a', lineaEnv('REDIS_PASSWORD'), '--no-auth-warning', ...args,
  ], { encoding: 'utf-8' }).trim();
}

const cuerpo = (from: string) => ({
  entry: [{ changes: [{ value: { messages: [{ from, type: 'text', text: { body: 'hola' } }] } }] }],
});

test.describe('Webhook de WhatsApp — peticiones sin firma', () => {

  test.beforeEach(() => { redis('DEL', `rl:${TELEFONO}`, `rl:notified:${TELEFONO}`); });
  test.afterEach(()  => { redis('DEL', `rl:${TELEFONO}`, `rl:notified:${TELEFONO}`); });

  test('una petición sin firma se rechaza', async () => {
    const api = await apiRequest.newContext();
    const r = await api.post(`${CHATBOT}/webhook`, { data: cuerpo(TELEFONO) });
    expect(r.status()).toBe(401);
    await api.dispose();
  });

  test('una petición sin firma NO deja rastro en el contador de tasa', async () => {
    const api = await apiRequest.newContext();
    for (let i = 0; i < 3; i++) {
      await api.post(`${CHATBOT}/webhook`, { data: cuerpo(TELEFONO) });
    }
    await api.dispose();

    expect(
      redis('GET', `rl:${TELEFONO}`),
      'el limitador contó peticiones no autenticadas: un tercero puede envenenar ' +
      'el contador de un cliente real y provocar que le respondan 429',
    ).toBe('');
  });

  test('una ráfaga sin firma NO provoca ningún envío saliente', async () => {
    const api = await apiRequest.newContext();
    for (let i = 0; i < 25; i++) {
      await api.post(`${CHATBOT}/webhook`, { data: cuerpo(TELEFONO) });
    }
    await api.dispose();

    // Si el limitador llegó a avisar, dejó su marca de deduplicación.
    expect(
      redis('GET', `rl:notified:${TELEFONO}`),
      'sin credencial alguna se logró que el sistema enviara un WhatsApp al ' +
      'número elegido por quien hizo la petición',
    ).toBe('');
  });

  test('una petición CON firma válida sí se procesa', async () => {
    // Contraprueba imprescindible. Sin ella, un middleware que rechazara
    // absolutamente todo dejaría las tres pruebas anteriores en verde y el
    // webhook completamente roto.
    const appSecret = lineaEnv('META_APP_SECRET');
    test.skip(!appSecret, 'META_APP_SECRET no configurado en .env');

    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const firma = 'sha256=' + createHmac('sha256', appSecret).update(payload).digest('hex');

    const api = await apiRequest.newContext();
    const r = await api.post(`${CHATBOT}/webhook`, {
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma },
      data: payload,
    });
    const estado = r.status();
    const json = await r.json();   // antes de dispose(), o la respuesta ya no existe
    await api.dispose();

    expect(estado, 'una petición legítima de Meta tiene que pasar').toBe(200);
    expect(json).toEqual({ status: 'ok' });
  });

  test('la verificación GET de Meta sigue funcionando', async () => {
    // El middleware de firma se registra solo para POST. Si alguien ampliara
    // `forRoutes` a todos los métodos, este GET empezaría a exigir una firma
    // que Meta no envía aquí, y la URL del webhook no se podría volver a dar
    // de alta. No romperia ninguna otra prueba: solo esta.
    const token = lineaEnv('META_VERIFY_TOKEN');
    test.skip(!token, 'META_VERIFY_TOKEN no configurado en .env');

    const api = await apiRequest.newContext();
    const r = await api.get(
      `${CHATBOT}/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}` +
      `&hub.challenge=PRUEBA123`,
    );
    const estado = r.status();
    const cuerpoTexto = await r.text();

    const malo = await api.get(
      `${CHATBOT}/webhook?hub.mode=subscribe&hub.verify_token=noEsElToken&hub.challenge=PRUEBA123`,
    );
    const estadoMalo = malo.status();
    await api.dispose();

    expect(estado).toBe(200);
    expect(cuerpoTexto, 'Meta espera que se le devuelva el reto tal cual').toBe('PRUEBA123');
    expect(estadoMalo, 'con un token equivocado no se verifica nada').toBe(403);
  });
});
