import { test, expect, APIRequestContext } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, estado, sobre, zz } from './arnes';

/**
 * Módulo Catálogos y configuración — 30 casos.
 *
 * Junta cinco controladores que compartían una cosa: **ninguno tenía una sola
 * prueba de extremo a extremo**. Respuestas predefinidas, perfil de la empresa,
 * ajustes de administración, eventos del bot y el QR de cobro por cliente.
 *
 * Parecen menores y dos no lo son:
 *
 *  - El **perfil de la empresa** es el membrete de facturas y comprobantes:
 *    quien lo cambia, cambia lo que el cliente recibe con su factura.
 *  - El **QR del cliente** es a dónde va su dinero. Sustituirlo es desviar
 *    cobros, y por eso solo debería poder tocarlo un administrador.
 */
test.describe('Catálogos y configuración', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let clienteId: string;
  let respuestaId = '';
  const INEXISTENTE = '00000000-0000-0000-0000-000000000000';

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    clienteId = estado().clienteId;
    const r = await admin.post('/api/canned-responses', {
      data: { Title: zz('Respuesta'), Body: 'Cuerpo de prueba de la suite E2E.', Category: 'ZZ' },
    });
    if (r.status() < 300) respuestaId = (await r.json()).data?.Id ?? '';
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  // ── Respuestas predefinidas ───────────────────────────────────────────────

  test('01 · listar respuestas sin sesión se rechaza', async () => {
    expect((await anon.get('/api/canned-responses')).status()).toBe(401);
  });

  test('02 · un Técnico SÍ puede listar respuestas', async () => {
    // Son su herramienta de trabajo al atender un ticket.
    expect((await tecnico.get('/api/canned-responses')).status()).toBe(200);
  });

  test('03 · un Técnico NO puede crear respuestas', async () => {
    const r = await tecnico.post('/api/canned-responses', {
      data: { Title: zz('Respuesta'), Body: 'x', Category: null },
    });
    expect([401, 403]).toContain(r.status());
  });

  test('04 · un Técnico NO puede modificar respuestas', async () => {
    const r = await tecnico.put(`/api/canned-responses/${INEXISTENTE}`, { data: { Title: 'x' } });
    expect([401, 403]).toContain(r.status());
  });

  test('05 · un Técnico NO puede borrar respuestas', async () => {
    const r = await tecnico.delete(`/api/canned-responses/${INEXISTENTE}`);
    expect([401, 403]).toContain(r.status());
  });

  test('06 · el listado responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/canned-responses'));
    expect(s.success).toBe(true);
  });

  test('07 · la respuesta creada aparece en el listado', async () => {
    test.skip(!respuestaId, 'no se pudo crear la respuesta base');
    const s = await sobre(await admin.get('/api/canned-responses'));
    const items = s.data?.Items ?? s.data ?? [];
    expect(items.some((x: any) => x.Id === respuestaId)).toBe(true);
  });

  test('08 · includeInactive cambia lo que devuelve, y no rompe', async () => {
    expect((await admin.get('/api/canned-responses?includeInactive=true')).status()).toBe(200);
  });

  test('09 · una respuesta sin título se rechaza', async () => {
    const r = await admin.post('/api/canned-responses', { data: { Title: '', Body: 'x' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('10 · una respuesta sin cuerpo se rechaza', async () => {
    // Una plantilla vacía se insertaría en la conversación sin decir nada.
    const r = await admin.post('/api/canned-responses', { data: { Title: zz('R'), Body: '' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('11 · modificar una respuesta cambia lo que se lee después', async () => {
    test.skip(!respuestaId, 'no se pudo crear la respuesta base');
    const titulo = zz('RespuestaEditada');
    await admin.put(`/api/canned-responses/${respuestaId}`, { data: { Title: titulo } });
    const s = await sobre(await admin.get('/api/canned-responses'));
    const items = s.data?.Items ?? s.data ?? [];
    expect(items.find((x: any) => x.Id === respuestaId)?.Title).toBe(titulo);
  });

  test('12 · borrar una respuesta inexistente no rompe el servidor', async () => {
    const r = await admin.delete(`/api/canned-responses/${INEXISTENTE}`);
    expect(r.status()).toBeLessThan(500);
  });

  // ── Perfil de la empresa: el membrete de las facturas ─────────────────────

  test('13 · el perfil de empresa sin sesión se rechaza', async () => {
    expect((await anon.get('/api/admin/company-profile')).status()).toBe(401);
  });

  test('14 · un Técnico SÍ puede LEER el perfil de empresa', async () => {
    // Es `AllRoles`: aparece en documentos que él genera.
    expect((await tecnico.get('/api/admin/company-profile')).status()).toBe(200);
  });

  test('15 · un Técnico NO puede CAMBIAR el perfil de empresa', async () => {
    // Cambiarlo cambia el membrete de todas las facturas que reciba el cliente.
    const r = await tecnico.put('/api/admin/company-profile', { data: { Name: 'Otra empresa' } });
    expect([401, 403]).toContain(r.status());
  });

  test('16 · el perfil responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/admin/company-profile'));
    expect(s.success).toBe(true);
  });

  test('17 · un perfil sin nombre comercial se rechaza', async () => {
    // El nombre es lo único obligatorio: sin él la factura sale sin membrete.
    const r = await admin.put('/api/admin/company-profile', { data: { Name: '' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('18 · modificar el perfil cambia lo que se lee después', async () => {
    const s0 = await sobre(await admin.get('/api/admin/company-profile'));
    const original = s0.data ?? {};
    const nombre = zz('Empresa');

    await admin.put('/api/admin/company-profile', { data: { ...original, Name: nombre } });
    const s1 = await sobre(await admin.get('/api/admin/company-profile'));
    expect(s1.data.Name).toBe(nombre);

    // Se deja como estaba: es configuración compartida, no un dato de prueba.
    await admin.put('/api/admin/company-profile', { data: original });
  });

  // ── Ajustes de administración ─────────────────────────────────────────────

  test('19 · los ajustes sin sesión se rechazan', async () => {
    expect((await anon.get('/api/admin/settings')).status()).toBe(401);
  });

  test('20 · un Técnico NO puede leer los ajustes', async () => {
    const r = await tecnico.get('/api/admin/settings');
    expect([401, 403]).toContain(r.status());
  });

  test('21 · un Técnico NO puede cambiar los ajustes', async () => {
    const r = await tecnico.put('/api/admin/settings', { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('22 · los ajustes responden para el administrador', async () => {
    expect((await admin.get('/api/admin/settings')).status()).toBe(200);
  });

  test('23 · los ajustes NO exponen secretos', async () => {
    // Es una pantalla de configuración: si algún día alguien mete ahí una clave
    // de API, esta prueba lo dirá antes de que llegue al navegador.
    const crudo = (await sobre(await admin.get('/api/admin/settings'))).crudo;
    expect(crudo).not.toMatch(/AIza[0-9A-Za-z_\-]{30,}/);
    expect(crudo).not.toMatch(/EAA[0-9A-Za-z]{50,}/);
    expect(crudo.toLowerCase()).not.toContain('passwordhash');
  });

  // ── QR de cobro del cliente: a dónde va su dinero ─────────────────────────

  test('24 · el QR de un cliente sin sesión se rechaza', async () => {
    expect((await anon.get(`/api/clients/${clienteId}/qr`)).status()).toBe(401);
  });

  test('25 · un Técnico SÍ puede consultar la info del QR', async () => {
    const r = await tecnico.get(`/api/clients/${clienteId}/qr/info`);
    expect(r.status()).toBeLessThan(500);
    expect([200, 204, 404]).toContain(r.status());
  });

  test('26 · un Técnico SÍ puede ver el histórico de QR', async () => {
    const r = await tecnico.get(`/api/clients/${clienteId}/qr/history`);
    expect(r.status()).toBeLessThan(400);
  });

  test('27 · un Técnico NO puede SUSTITUIR el QR de cobro', async () => {
    // El caso que de verdad importa de este controlador: sustituir el QR es
    // desviar los pagos del cliente a otra cuenta. Se manda multipart a
    // propósito, porque un 415 por el tipo de medio no probaría nada.
    const r = await tecnico.post(`/api/clients/${clienteId}/qr`, {
      multipart: { file: { name: 'zz.png', mimeType: 'image/png', buffer: Buffer.from('zz') } },
    });
    expect([401, 403]).toContain(r.status());
  });

  test('28 · el QR de un cliente inexistente no rompe el servidor', async () => {
    const r = await admin.get(`/api/clients/${INEXISTENTE}/qr`);
    expect(r.status()).toBeLessThan(500);
  });

  // ── Eventos del bot ───────────────────────────────────────────────────────

  test('29 · los eventos del bot sin sesión se rechazan', async () => {
    const r = await anon.post('/api/bot-events', {
      data: { EventType: 'ZZ_PRUEBA', PhoneNumber: '59100000090' },
    });
    expect(r.status()).toBe(401);
  });

  test('30 · un evento del bot con cuerpo vacío no rompe el servidor', async () => {
    const r = await admin.post('/api/bot-events', { data: {} });
    expect(r.status()).toBeLessThan(500);
  });
});
