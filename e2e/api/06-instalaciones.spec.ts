import { test, expect, APIRequestContext } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, estado, sobre, zzNombre, telefonoUnico, documentoUnico } from './arnes';

/**
 * Módulo Instalaciones — 30 casos.
 *
 * La ruta es `api/instalaciones` (en español, a diferencia del resto de la API).
 * Es el módulo que agenda trabajo de campo y reserva puertos de las cajas NAP,
 * así que sus errores se pagan en desplazamientos en balde o en capacidad
 * bloqueada que nadie usa.
 */
test.describe('Instalaciones', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let clienteId: string, planId: string;
  const INEXISTENTE = '00000000-0000-0000-0000-000000000000';

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    const e = estado(); clienteId = e.clienteId; planId = e.planId;
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  const nueva = (extra: Record<string, unknown> = {}) => ({
    NombreProspecto: zzNombre('Prospecto'),
    TelefonoProspecto: telefonoUnico(),
    CedulaProspecto: documentoUnico(),
    PlanId: planId,
    Fecha: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
    Hora: '09:00',
    Direccion: 'ZZ Calle de prueba',
    Latitud: -17.78, Longitud: -63.18,
    ...extra,
  });

  // ── Autorización ──────────────────────────────────────────────────────────

  test('01 · listar instalaciones sin sesión se rechaza', async () => {
    expect((await anon.get('/api/instalaciones')).status()).toBe(401);
  });

  test('02 · crear una instalación sin sesión se rechaza', async () => {
    expect((await anon.post('/api/instalaciones', { data: nueva() })).status()).toBe(401);
  });

  test('03 · consultar la vigente sin sesión se rechaza', async () => {
    expect((await anon.get('/api/instalaciones/vigente')).status()).toBe(401);
  });

  test('04 · un Técnico SÍ puede listar instalaciones', async () => {
    expect((await tecnico.get('/api/instalaciones')).status()).toBe(200);
  });

  test('05 · un Técnico SÍ puede consultar una instalación concreta', async () => {
    const r = await tecnico.get(`/api/instalaciones/${INEXISTENTE}`);
    expect([404, 200]).toContain(r.status());   // autorizado; simplemente no existe
  });

  test('06 · cancelar sin sesión se rechaza', async () => {
    const r = await anon.patch(`/api/instalaciones/${INEXISTENTE}/cancelar`, { data: { Motivo: 'x' } });
    expect(r.status()).toBe(401);
  });

  test('07 · marcar no-realizada sin sesión se rechaza', async () => {
    const r = await anon.patch(`/api/instalaciones/${INEXISTENTE}/no-realizada`, { data: { Motivo: 'x' } });
    expect(r.status()).toBe(401);
  });

  test('08 · completar sin sesión se rechaza', async () => {
    const r = await anon.patch(`/api/instalaciones/${INEXISTENTE}/completar`, { data: {} });
    expect(r.status()).toBe(401);
  });

  test('09 · asignar caja NAP sin sesión se rechaza', async () => {
    const r = await anon.patch(`/api/instalaciones/${INEXISTENTE}/caja`, { data: {} });
    expect(r.status()).toBe(401);
  });

  // ── Lectura ───────────────────────────────────────────────────────────────

  test('10 · el listado responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/instalaciones'));
    expect(s.success).toBe(true);
  });

  test('11 · el listado devuelve una colección', async () => {
    const s = await sobre(await admin.get('/api/instalaciones'));
    const items = s.data?.Items ?? s.data;
    expect(Array.isArray(items)).toBe(true);
  });

  test('12 · una instalación inexistente da 404, no 500', async () => {
    expect((await admin.get(`/api/instalaciones/${INEXISTENTE}`)).status()).toBe(404);
  });

  test('13 · un id que no es GUID no llega al handler', async () => {
    const r = await admin.get('/api/instalaciones/no-soy-guid');
    expect([400, 404]).toContain(r.status());
  });

  test('14 · la instalación vigente responde para un teléfono cualquiera', async () => {
    const r = await admin.get(`/api/instalaciones/vigente?phone=${estado().clienteTelefono}`);
    expect(r.status()).toBeLessThan(500);
  });

  test('15 · la agenda de instalaciones responde', async () => {
    const r = await admin.get('/api/instalaciones/agenda');
    expect(r.status()).toBeLessThan(500);
  });

  // ── Identidad del prospecto ───────────────────────────────────────────────

  test('16 · una instalación sin nombre de prospecto se rechaza', async () => {
    const r = await admin.post('/api/instalaciones', { data: nueva({ NombreProspecto: '' }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('17 · un nombre de prospecto con dígitos se rechaza', async () => {
    const r = await admin.post('/api/instalaciones', { data: nueva({ NombreProspecto: 'Juan 123' }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('18 · una instalación sin cédula se rechaza', async () => {
    // Misma regla que en tickets: agendar trabajo exige saber a quién se visita.
    const r = await admin.post('/api/instalaciones', { data: nueva({ CedulaProspecto: null }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('19 · un teléfono inválido se rechaza', async () => {
    const r = await admin.post('/api/instalaciones', { data: nueva({ TelefonoProspecto: 'abc' }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('20 · una instalación sin teléfono se rechaza', async () => {
    const r = await admin.post('/api/instalaciones', { data: nueva({ TelefonoProspecto: '' }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  // ── Agenda y ubicación ────────────────────────────────────────────────────

  test('21 · una instalación sin plan se rechaza', async () => {
    const r = await admin.post('/api/instalaciones', { data: nueva({ PlanId: null }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('22 · un plan inexistente se rechaza', async () => {
    const r = await admin.post('/api/instalaciones', { data: nueva({ PlanId: INEXISTENTE }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('23 · una fecha en el pasado se rechaza', async () => {
    // Agendar hacia atrás no es agendar: o ya ocurrió, o es un error de tecleo.
    const ayer = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
    const r = await admin.post('/api/instalaciones', { data: nueva({ Fecha: ayer }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('24 · una hora con formato inválido se rechaza', async () => {
    const r = await admin.post('/api/instalaciones', { data: nueva({ Hora: '25:99' }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('25 · una latitud fuera de rango se rechaza', async () => {
    const r = await admin.post('/api/instalaciones', { data: nueva({ Latitud: 999 }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('26 · una longitud fuera de rango se rechaza', async () => {
    const r = await admin.post('/api/instalaciones', { data: nueva({ Longitud: -999 }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('27 · un cuerpo vacío se rechaza sin romper el servidor', async () => {
    const r = await admin.post('/api/instalaciones', { data: {} });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  // ── Operaciones sobre instalaciones inexistentes ──────────────────────────

  test('28 · cancelar una instalación inexistente no rompe el servidor', async () => {
    const r = await admin.patch(`/api/instalaciones/${INEXISTENTE}/cancelar`, {
      data: { Motivo: 'motivo de prueba suficientemente largo' },
    });
    expect(r.status()).toBeLessThan(500);
  });

  test('29 · reprogramar una instalación inexistente no rompe el servidor', async () => {
    const r = await admin.patch(`/api/instalaciones/${INEXISTENTE}/reprogramar`, {
      data: { Fecha: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), Hora: '10:00' },
    });
    expect(r.status()).toBeLessThan(500);
  });

  test('30 · completar una instalación inexistente no rompe el servidor', async () => {
    const r = await admin.patch(`/api/instalaciones/${INEXISTENTE}/completar`, { data: {} });
    expect(r.status()).toBeLessThan(500);
  });

  // ── Evidencia de cierre ───────────────────────────────────────────────────

  test('31 · subir fotos sin sesión se rechaza', async () => {
    const r = await anon.post(`/api/instalaciones/${INEXISTENTE}/fotos`, {
      multipart: { file: { name: 'zz.png', mimeType: 'image/png', buffer: Buffer.from('zz') } },
    });
    expect(r.status()).toBe(401);
  });

  test('32 · subir fotos a una instalación inexistente no rompe el servidor', async () => {
    // Las fotos son la evidencia de que la instalación se hizo: si el endpoint
    // reventara, el técnico cerraría el trabajo sin poder demostrarlo.
    const r = await admin.post(`/api/instalaciones/${INEXISTENTE}/fotos`, {
      multipart: { file: { name: 'zz.png', mimeType: 'image/png', buffer: Buffer.from('zz') } },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });
});
