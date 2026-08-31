import { test, expect, APIRequestContext } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, estado, sobre, zz } from './arnes';

/**
 * Módulo Planes — 30 casos.
 *
 * Superficie: GET /api/plans, GET /{id}, POST, PUT, GET /{id}/history.
 * Pequeña, pero es la base de la facturación: el precio del plan es lo que
 * termina en la factura del cliente, así que las reglas de aquí tienen
 * consecuencias monetarias.
 */
test.describe('Planes', () => {
  let admin: APIRequestContext;
  let tecnico: APIRequestContext;
  let anon: APIRequestContext;
  let planId: string;

  test.beforeAll(async () => {
    admin   = await comoAdmin();
    tecnico = await comoTecnico();
    anon    = await sinSesion();
    planId  = estado().planId;
  });

  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  const nuevoPlan = (extra: Record<string, unknown> = {}) => ({
    Name: zz('Plan'), SpeedMb: 100, MonthlyPrice: 300, ...extra,
  });

  // ── Autorización ──────────────────────────────────────────────────────────

  test('01 · listar planes sin sesión se rechaza', async () => {
    expect((await anon.get('/api/plans')).status()).toBe(401);
  });

  test('02 · ver un plan sin sesión se rechaza', async () => {
    expect((await anon.get(`/api/plans/${planId}`)).status()).toBe(401);
  });

  test('03 · crear un plan sin sesión se rechaza', async () => {
    expect((await anon.post('/api/plans', { data: nuevoPlan() })).status()).toBe(401);
  });

  test('04 · un Técnico NO puede crear planes', async () => {
    // El precio del plan es dinero: crearlo es competencia del administrador.
    const r = await tecnico.post('/api/plans', { data: nuevoPlan() });
    expect([401, 403]).toContain(r.status());
  });

  test('05 · un Técnico NO puede modificar planes', async () => {
    const r = await tecnico.put(`/api/plans/${planId}`, { data: nuevoPlan() });
    expect([401, 403]).toContain(r.status());
  });

  test('06 · un Técnico NO puede ver el histórico de precios', async () => {
    const r = await tecnico.get(`/api/plans/${planId}/history`);
    expect([401, 403]).toContain(r.status());
  });

  test('07 · un Técnico SÍ puede listar planes', async () => {
    // Los necesita para trabajar: no todo lo del módulo es de administración.
    expect((await tecnico.get('/api/plans')).status()).toBe(200);
  });

  test('08 · un token con firma alterada se rechaza', async () => {
    const roto = estado().tokenAdmin.slice(0, -3) + 'AAA';
    const ctx = await sinSesion();
    const r = await ctx.get('/api/plans', { headers: { Authorization: `Bearer ${roto}` } });
    await ctx.dispose();
    expect(r.status()).toBe(401);
  });

  // ── Lectura ───────────────────────────────────────────────────────────────

  test('09 · el listado responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/plans'));
    expect(s.success).toBe(true);
    expect(s.data).toBeTruthy();
  });

  test('10 · el listado incluye el plan base', async () => {
    const s = await sobre(await admin.get('/api/plans'));
    const lista = Array.isArray(s.data) ? s.data : s.data.Items ?? [];
    expect(lista.some((p: any) => p.Id === planId)).toBe(true);
  });

  test('11 · cada plan trae nombre, velocidad y precio', async () => {
    const s = await sobre(await admin.get('/api/plans'));
    const lista = Array.isArray(s.data) ? s.data : s.data.Items ?? [];
    const p = lista.find((x: any) => x.Id === planId);
    expect(p.Name).toBeTruthy();
    expect(typeof p.SpeedMb).toBe('number');
    expect(typeof p.MonthlyPrice).toBe('number');
  });

  test('12 · onlyActive=true devuelve solo planes activos', async () => {
    const s = await sobre(await admin.get('/api/plans?onlyActive=true'));
    const lista = Array.isArray(s.data) ? s.data : s.data.Items ?? [];
    expect(lista.every((p: any) => p.IsActive !== false)).toBe(true);
  });

  test('13 · consultar un plan por su id lo devuelve', async () => {
    const s = await sobre(await admin.get(`/api/plans/${planId}`));
    expect(s.data.Id).toBe(planId);
  });

  test('14 · un id inexistente da 404, no 500', async () => {
    const r = await admin.get('/api/plans/00000000-0000-0000-0000-000000000000');
    expect(r.status()).toBe(404);
  });

  test('15 · un id que no es un GUID da 400, no 500', async () => {
    // La restricción de ruta {id:guid} debe filtrarlo antes de llegar al handler.
    const r = await admin.get('/api/plans/no-soy-un-guid');
    expect([400, 404]).toContain(r.status());
  });

  test('16 · el histórico de precios responde para un plan existente', async () => {
    expect((await admin.get(`/api/plans/${planId}/history`)).status()).toBe(200);
  });

  // ── Creación ──────────────────────────────────────────────────────────────

  test('17 · crear un plan válido lo devuelve con id', async () => {
    const s = await sobre(await admin.post('/api/plans', { data: nuevoPlan() }));
    expect(s.data.Id).toBeTruthy();
  });

  test('18 · el plan creado se puede leer después', async () => {
    const creado = await sobre(await admin.post('/api/plans', { data: nuevoPlan() }));
    const leido = await sobre(await admin.get(`/api/plans/${creado.data.Id}`));
    expect(leido.data.Id).toBe(creado.data.Id);
  });

  test('19 · un plan sin nombre se rechaza', async () => {
    const r = await admin.post('/api/plans', { data: nuevoPlan({ Name: '' }) });
    expect(r.status()).toBe(400);
  });

  test('20 · el motivo del rechazo llega en `message`', async () => {
    // El frontend solo lee `message`. Si el error viaja en otro campo, el
    // usuario ve un texto genérico y no sabe qué corregir.
    const s = await sobre(await admin.post('/api/plans', { data: nuevoPlan({ Name: '' }) }));
    expect(s.success).toBe(false);
    expect(s.message).toBeTruthy();
  });

  test('21 · velocidad cero se rechaza', async () => {
    const r = await admin.post('/api/plans', { data: nuevoPlan({ SpeedMb: 0 }) });
    expect(r.status()).toBe(400);
  });

  test('22 · velocidad negativa se rechaza', async () => {
    const r = await admin.post('/api/plans', { data: nuevoPlan({ SpeedMb: -10 }) });
    expect(r.status()).toBe(400);
  });

  test('23 · precio cero se rechaza', async () => {
    // Un plan gratis silencioso dejaría de facturar sin que nadie lo note.
    const r = await admin.post('/api/plans', { data: nuevoPlan({ MonthlyPrice: 0 }) });
    expect(r.status()).toBe(400);
  });

  test('24 · precio negativo se rechaza', async () => {
    const r = await admin.post('/api/plans', { data: nuevoPlan({ MonthlyPrice: -50 }) });
    expect(r.status()).toBe(400);
  });

  test('25 · un nombre de más de 100 caracteres se rechaza', async () => {
    const r = await admin.post('/api/plans', { data: nuevoPlan({ Name: 'P'.repeat(101) }) });
    expect(r.status()).toBe(400);
  });

  test('26 · un cuerpo vacío se rechaza sin romper el servidor', async () => {
    const r = await admin.post('/api/plans', { data: {} });
    expect(r.status()).toBe(400);
  });

  test('27 · un plan inválido NO se guarda', async () => {
    // Contraprueba del 400: rechazar y guardar igualmente sería lo peor de ambos.
    const nombre = zz('PlanInvalido');
    await admin.post('/api/plans', { data: { Name: nombre, SpeedMb: 0, MonthlyPrice: 0 } });
    const s = await sobre(await admin.get('/api/plans'));
    const lista = Array.isArray(s.data) ? s.data : s.data.Items ?? [];
    expect(lista.some((p: any) => p.Name === nombre)).toBe(false);
  });

  // ── Modificación ──────────────────────────────────────────────────────────

  test('28 · modificar un plan cambia lo que se lee después', async () => {
    const creado = await sobre(await admin.post('/api/plans', { data: nuevoPlan() }));
    const nombre = zz('PlanRenombrado');
    await admin.put(`/api/plans/${creado.data.Id}`, {
      data: { Name: nombre, SpeedMb: 250, MonthlyPrice: 450 },
    });
    const leido = await sobre(await admin.get(`/api/plans/${creado.data.Id}`));
    expect(leido.data.Name).toBe(nombre);
    expect(leido.data.SpeedMb).toBe(250);
  });

  test('29 · modificar con precio inválido se rechaza', async () => {
    const r = await admin.put(`/api/plans/${planId}`, {
      data: { Name: zz('Plan'), SpeedMb: 100, MonthlyPrice: -1 },
    });
    expect(r.status()).toBe(400);
  });

  test('30 · cambiar el precio deja rastro en el histórico', async () => {
    // El precio es dinero: tiene que poder auditarse quién lo cambió y cuándo.
    const creado = await sobre(await admin.post('/api/plans', { data: nuevoPlan() }));
    await admin.put(`/api/plans/${creado.data.Id}`, {
      data: { Name: zz('Plan'), SpeedMb: 100, MonthlyPrice: 999 },
    });
    const h = await sobre(await admin.get(`/api/plans/${creado.data.Id}/history`));
    const filas = Array.isArray(h.data) ? h.data : h.data?.Items ?? [];
    expect(filas.length).toBeGreaterThan(0);
  });
});
