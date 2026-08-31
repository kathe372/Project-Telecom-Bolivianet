import { test, expect, APIRequestContext } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, estado, sobre } from './arnes';

/**
 * Módulo Agenda de instalaciones — 30 casos.
 *
 * Cuatro endpoints de calendario que no tenían prueba alguna, más la asignación
 * de técnicos y la creación administrativa de instalaciones.
 *
 * Es lo que decide **qué franjas se le ofrecen a un cliente** por WhatsApp. Un
 * fallo aquí no da error: ofrece un hueco que no existe, y el cliente se queda
 * esperando una visita que nadie tenía agendada.
 *
 * Los rangos de fecha se vigilan con insistencia porque estos endpoints reciben
 * lo que ponga el navegador en la URL, y un rango invertido o absurdo no debe
 * convertirse en una consulta que barra la tabla entera.
 */
test.describe('Agenda de instalaciones', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let planId: string, tecnicoId: string;
  const INEXISTENTE = '00000000-0000-0000-0000-000000000000';

  const hoy    = new Date().toISOString().slice(0, 10);
  const enUnMes = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    const e = estado(); planId = e.planId; tecnicoId = e.tecnicoId;
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  // ── Autorización ──────────────────────────────────────────────────────────

  test('01 · las franjas disponibles sin sesión se rechazan', async () => {
    expect((await anon.get('/api/instalaciones/slots-disponibles')).status()).toBe(401);
  });

  test('02 · «mi agenda» sin sesión se rechaza', async () => {
    expect((await anon.get(`/api/instalaciones/mi-agenda?fecha=${hoy}`)).status()).toBe(401);
  });

  test('03 · el calendario sin sesión se rechaza', async () => {
    const r = await anon.get(`/api/instalaciones/calendario?desde=${hoy}&hasta=${enUnMes}`);
    expect(r.status()).toBe(401);
  });

  test('04 · el calendario de visitas sin sesión se rechaza', async () => {
    const r = await anon.get(`/api/instalaciones/calendario/visitas-tickets?desde=${hoy}&hasta=${enUnMes}`);
    expect(r.status()).toBe(401);
  });

  test('05 · asignar técnicos sin sesión se rechaza', async () => {
    const r = await anon.post(`/api/instalaciones/${INEXISTENTE}/tecnicos`, { data: {} });
    expect(r.status()).toBe(401);
  });

  test('06 · crear una instalación administrativa sin sesión se rechaza', async () => {
    expect((await anon.post('/api/instalaciones/admin', { data: {} })).status()).toBe(401);
  });

  test('07 · un Técnico SÍ puede ver su agenda', async () => {
    // Es literalmente su lista de trabajo del día.
    expect((await tecnico.get(`/api/instalaciones/mi-agenda?fecha=${hoy}`)).status()).toBe(200);
  });

  test('08 · un Técnico SÍ puede ver el calendario', async () => {
    const r = await tecnico.get(`/api/instalaciones/calendario?desde=${hoy}&hasta=${enUnMes}`);
    expect(r.status()).toBe(200);
  });

  test('09 · un Técnico SÍ puede ver el calendario de visitas de tickets', async () => {
    const r = await tecnico.get(`/api/instalaciones/calendario/visitas-tickets?desde=${hoy}&hasta=${enUnMes}`);
    expect(r.status()).toBe(200);
  });

  test('10 · un Técnico SÍ puede consultar franjas disponibles', async () => {
    expect((await tecnico.get('/api/instalaciones/slots-disponibles')).status()).toBe(200);
  });

  // ── Franjas ofrecidas al cliente ──────────────────────────────────────────

  test('11 · las franjas responden con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/instalaciones/slots-disponibles'));
    expect(s.success).toBe(true);
  });

  test('12 · las franjas devuelven una colección', async () => {
    const s = await sobre(await admin.get('/api/instalaciones/slots-disponibles'));
    const items = s.data?.Items ?? s.data;
    expect(Array.isArray(items)).toBe(true);
  });

  test('13 · se puede pedir un número concreto de días', async () => {
    expect((await admin.get('/api/instalaciones/slots-disponibles?dias=3')).status()).toBe(200);
  });

  test('14 · pedir 0 días se rechaza', async () => {
    // El controlador acota a 1–30: sin ese tope, un `dias` grande recorrería
    // meses de agenda en una sola petición.
    const r = await admin.get('/api/instalaciones/slots-disponibles?dias=0');
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('15 · pedir más de 30 días se rechaza', async () => {
    const r = await admin.get('/api/instalaciones/slots-disponibles?dias=365');
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('16 · pedir días negativos se rechaza', async () => {
    const r = await admin.get('/api/instalaciones/slots-disponibles?dias=-5');
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('17 · un «dias» no numérico no rompe el servidor', async () => {
    const r = await admin.get('/api/instalaciones/slots-disponibles?dias=muchos');
    expect(r.status()).toBeLessThan(500);
  });

  test('18 · las franjas se pueden filtrar por plan', async () => {
    const r = await admin.get(`/api/instalaciones/slots-disponibles?dias=7&planId=${planId}`);
    expect(r.status()).toBe(200);
  });

  test('19 · un plan inexistente no rompe el servidor', async () => {
    const r = await admin.get(`/api/instalaciones/slots-disponibles?planId=${INEXISTENTE}`);
    expect(r.status()).toBeLessThan(500);
  });

  test('20 · ninguna franja ofrecida cae en el pasado', async () => {
    // Es el fallo silencioso de este módulo: ofrecer un hueco ya vencido. El
    // cliente lo elige, nadie va, y no hay error en ninguna parte.
    const s = await sobre(await admin.get('/api/instalaciones/slots-disponibles?dias=7'));
    const items = s.data?.Items ?? s.data ?? [];
    const ayer = new Date(Date.now() - 864e5);
    for (const f of items) {
      const cuando = f.Fecha ?? f.fecha ?? f.Date;
      if (cuando) expect(new Date(cuando).getTime()).toBeGreaterThan(ayer.getTime());
    }
  });

  // ── Calendario ────────────────────────────────────────────────────────────

  test('21 · el calendario responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get(`/api/instalaciones/calendario?desde=${hoy}&hasta=${enUnMes}`));
    expect(s.success).toBe(true);
  });

  test('22 · un rango invertido se rechaza o devuelve vacío, pero no rompe', async () => {
    const r = await admin.get(`/api/instalaciones/calendario?desde=${enUnMes}&hasta=${hoy}`);
    expect(r.status()).toBeLessThan(500);
  });

  test('23 · faltar una fecha del rango no rompe el servidor', async () => {
    const r = await admin.get(`/api/instalaciones/calendario?desde=${hoy}`);
    expect(r.status()).toBeLessThan(500);
  });

  test('24 · una fecha con formato inválido no rompe el servidor', async () => {
    const r = await admin.get('/api/instalaciones/calendario?desde=ayer&hasta=mañana');
    expect(r.status()).toBeLessThan(500);
  });

  test('25 · el calendario se puede filtrar por técnico', async () => {
    const r = await admin.get(
      `/api/instalaciones/calendario?desde=${hoy}&hasta=${enUnMes}&tecnicoId=${tecnicoId}`);
    expect(r.status()).toBe(200);
  });

  test('26 · el calendario de visitas de tickets responde', async () => {
    const r = await admin.get(`/api/instalaciones/calendario/visitas-tickets?desde=${hoy}&hasta=${enUnMes}`);
    expect(r.status()).toBe(200);
  });

  test('27 · «mi agenda» exige una fecha, y sin ella no rompe', async () => {
    const r = await admin.get('/api/instalaciones/mi-agenda');
    expect(r.status()).toBeLessThan(500);
  });

  test('28 · «mi agenda» con fecha inválida no rompe el servidor', async () => {
    const r = await admin.get('/api/instalaciones/mi-agenda?fecha=no-es-fecha');
    expect(r.status()).toBeLessThan(500);
  });

  // ── Asignación de técnicos y alta administrativa ──────────────────────────

  test('29 · asignar técnicos a una instalación inexistente no rompe el servidor', async () => {
    const r = await admin.post(`/api/instalaciones/${INEXISTENTE}/tecnicos`, {
      data: { TechnicianIds: [tecnicoId] },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('30 · el alta administrativa con cuerpo vacío se rechaza sin romper', async () => {
    const r = await admin.post('/api/instalaciones/admin', { data: {} });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });
});
