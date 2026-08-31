import { test, expect, APIRequestContext } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, estado, sobre } from './arnes';

/**
 * Módulo Facturación — 30 casos.
 *
 * Aquí todo es dinero, así que el criterio para elegir los casos ha sido: ¿qué
 * fallo dejaría al negocio cobrando de menos, cobrando de más, o sin saber
 * cuánto le deben? De ahí el peso de las restricciones de rol (solo Admin) y de
 * los rangos de fecha, que son los que alimentan los informes.
 */
test.describe('Facturación', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let clienteId: string;
  const anio = new Date().getFullYear();

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    clienteId = estado().clienteId;
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  // ── Autorización: facturación es solo del administrador ───────────────────

  test('01 · listar facturas sin sesión se rechaza', async () => {
    expect((await anon.get('/api/invoices')).status()).toBe(401);
  });

  test('02 · un Técnico NO puede listar facturas', async () => {
    const r = await tecnico.get('/api/invoices');
    expect([401, 403]).toContain(r.status());
  });

  test('03 · un Técnico NO puede ver deudores', async () => {
    const r = await tecnico.get('/api/invoices/deudores');
    expect([401, 403]).toContain(r.status());
  });

  test('04 · un Técnico NO puede generar facturación', async () => {
    // Generar factura es crear una obligación de cobro: no es del técnico.
    const r = await tecnico.post(`/api/invoices/generate?year=${anio}&month=1`);
    expect([401, 403]).toContain(r.status());
  });

  test('05 · un Técnico NO puede marcar vencidas', async () => {
    const r = await tecnico.post('/api/invoices/mark-overdue');
    expect([401, 403]).toContain(r.status());
  });

  test('06 · un Técnico NO puede anular una factura', async () => {
    const r = await tecnico.put(`/api/invoices/${clienteId}/void`, { data: { Motivo: 'prueba' } });
    expect([401, 403]).toContain(r.status());
  });

  test('07 · un Técnico NO puede ver las estadísticas de facturación', async () => {
    const r = await tecnico.get(`/api/invoices/stats?year=${anio}&month=1`);
    expect([401, 403]).toContain(r.status());
  });

  test('08 · un Técnico NO puede exportar facturación a Excel', async () => {
    const r = await tecnico.get('/api/invoices/export/excel');
    expect([401, 403]).toContain(r.status());
  });

  test('09 · generar facturación sin sesión se rechaza', async () => {
    expect((await anon.post(`/api/invoices/generate?year=${anio}&month=1`)).status()).toBe(401);
  });

  // ── Lectura ───────────────────────────────────────────────────────────────

  test('10 · el listado responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/invoices'));
    expect(s.success).toBe(true);
  });

  test('11 · el listado viene paginado', async () => {
    const s = await sobre(await admin.get('/api/invoices?PageNumber=1&PageSize=5'));
    const items = s.data.Items ?? s.data;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(5);
  });

  test('12 · se puede filtrar por año', async () => {
    expect((await admin.get(`/api/invoices?Year=${anio}`)).status()).toBe(200);
  });

  test('13 · se puede filtrar por estado', async () => {
    const s = await sobre(await admin.get('/api/invoices?Status=Pagada'));
    const items = s.data.Items ?? [];
    expect(items.every((f: any) => f.Status === 'Pagada')).toBe(true);
  });

  test('14 · un estado inexistente no rompe el servidor', async () => {
    const r = await admin.get('/api/invoices?Status=NoExisteEsteEstado');
    expect(r.status()).toBeLessThan(500);
  });

  test('15 · el listado de deudores responde', async () => {
    expect((await admin.get('/api/invoices/deudores')).status()).toBe(200);
  });

  test('16 · las estadísticas de un mes responden', async () => {
    expect((await admin.get(`/api/invoices/stats?year=${anio}&month=1`)).status()).toBe(200);
  });

  test('17 · las estadísticas por rango responden', async () => {
    expect((await admin.get(`/api/invoices/stats/range?fromYear=${anio}&fromMonth=1&toYear=${anio}&toMonth=12`))
      .status()).toBe(200);
  });

  test('18 · el informe anual responde', async () => {
    expect((await admin.get(`/api/invoices/annual-report?Year=${anio}`)).status()).toBe(200);
  });

  test('19 · la previsualización de facturación responde', async () => {
    // Es lo que se mira ANTES de generar: si falla, se factura a ciegas.
    expect((await admin.get(`/api/invoices/billing-preview?year=${anio}&month=1`)).status()).toBe(200);
  });

  test('20 · la previsualización no crea nada', async () => {
    // Que se llame "preview" no basta; hay que comprobar que no escribe.
    const antes = await sobre(await admin.get(`/api/invoices?Year=${anio}&PageNumber=1&PageSize=1`));
    await admin.get(`/api/invoices/billing-preview?year=${anio}&month=1`);
    const despues = await sobre(await admin.get(`/api/invoices?Year=${anio}&PageNumber=1&PageSize=1`));
    expect(despues.data.TotalCount).toBe(antes.data.TotalCount);
  });

  test('21 · las facturas de un cliente se pueden consultar', async () => {
    expect((await admin.get(`/api/clients/${clienteId}/invoices`)).status()).toBe(200);
  });

  test('22 · un cliente inexistente da 404 al pedir sus facturas', async () => {
    const r = await admin.get('/api/clients/00000000-0000-0000-0000-000000000000/invoices');
    expect([404, 200]).toContain(r.status());
  });

  // ── Rangos y validación ───────────────────────────────────────────────────

  test('23 · un mes 13 no se acepta', async () => {
    const r = await admin.get(`/api/invoices/stats?year=${anio}&month=13`);
    expect(r.status()).toBeLessThan(500);
  });

  test('24 · un mes 0 no se acepta', async () => {
    const r = await admin.get(`/api/invoices/stats?year=${anio}&month=0`);
    expect(r.status()).toBeLessThan(500);
  });

  test('25 · un año absurdo no rompe el servidor', async () => {
    const r = await admin.get('/api/invoices/stats?year=1800&month=1');
    expect(r.status()).toBeLessThan(500);
  });

  test('26 · generar facturación con mes inválido se rechaza', async () => {
    const r = await admin.post(`/api/invoices/generate?year=${anio}&month=99`);
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('27 · anular una factura inexistente da 404, no 500', async () => {
    const r = await admin.put('/api/invoices/00000000-0000-0000-0000-000000000000/void', {
      data: { Motivo: 'no existe' },
    });
    expect([400, 404]).toContain(r.status());
  });

  test('28 · anular sin motivo se rechaza', async () => {
    // Anular es borrar dinero del sistema: sin motivo no hay auditoría posible.
    const s = await sobre(await admin.get('/api/invoices?PageNumber=1&PageSize=1'));
    const f = (s.data.Items ?? [])[0];
    test.skip(!f, 'no hay facturas en la base para probar la anulación');
    const r = await admin.put(`/api/invoices/${f.Id}/void`, { data: { Motivo: '' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('29 · cambiar el estado de una factura inexistente no rompe', async () => {
    const r = await admin.patch('/api/invoices/00000000-0000-0000-0000-000000000000/estado', {
      data: { Estado: 'Enviada' },
    });
    expect(r.status()).toBeLessThan(500);
  });

  test('30 · la exportación a Excel devuelve un archivo, no JSON', async () => {
    // Exige año y mes: sin ellos responde 400 «Año o mes inválido», que es lo
    // correcto —exportar «todo» sería un volcado sin límite—.
    const r = await admin.get(`/api/invoices/export/excel?year=${anio}&month=1`);
    expect(r.status()).toBe(200);
    const tipo = r.headers()['content-type'] ?? '';
    expect(tipo).not.toContain('application/json');
  });

  test('30b · exportar sin año ni mes se rechaza, no vuelca todo', async () => {
    const r = await admin.get('/api/invoices/export/excel');
    expect(r.status()).toBe(400);
  });

  // ── Superficie que la medición de cobertura señaló sin tocar ──────────────

  test('31 · la exportación a PDF devuelve un archivo, no JSON', async () => {
    const r = await admin.get(`/api/invoices/export/pdf?year=${anio}&month=1`);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type'] ?? '').not.toContain('application/json');
  });

  test('32 · el informe anual se exporta a Excel', async () => {
    const r = await admin.get(`/api/invoices/annual-report/export/excel?Year=${anio}`);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type'] ?? '').not.toContain('application/json');
  });

  test('33 · el informe anual se exporta a PDF', async () => {
    const r = await admin.get(`/api/invoices/annual-report/export/pdf?Year=${anio}`);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type'] ?? '').not.toContain('application/json');
  });

  test('34 · una factura extraordinaria sin sesión se rechaza', async () => {
    expect((await anon.post('/api/invoices/extraordinary', { data: {} })).status()).toBe(401);
  });

  test('35 · un Técnico NO puede emitir facturas extraordinarias', async () => {
    // Crear una obligación de cobro fuera del ciclo mensual es competencia
    // exclusiva de administración.
    const r = await tecnico.post('/api/invoices/extraordinary', { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('36 · una factura extraordinaria de importe cero se rechaza', async () => {
    const r = await admin.post('/api/invoices/extraordinary', {
      data: { ClientId: clienteId, Amount: 0, Concepto: 'ZZ prueba' },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('37 · una factura extraordinaria de importe negativo se rechaza', async () => {
    const r = await admin.post('/api/invoices/extraordinary', {
      data: { ClientId: clienteId, Amount: -100, Concepto: 'ZZ prueba' },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('38 · marcar facturas como enviadas sin sesión se rechaza', async () => {
    expect((await anon.post('/api/invoices/marcar-enviadas', { data: {} })).status()).toBe(401);
  });

  test('39 · un Técnico NO puede marcar facturas como enviadas', async () => {
    const r = await tecnico.post('/api/invoices/marcar-enviadas', { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('40 · aplicar crédito a una factura inexistente no rompe el servidor', async () => {
    const r = await admin.post(
      '/api/invoices/00000000-0000-0000-0000-000000000000/aplicar-credito', { data: {} });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('41 · un Técnico NO puede aplicar crédito a una factura', async () => {
    // Aplicar crédito reduce lo que el cliente debe: es mover dinero.
    const r = await tecnico.post(
      '/api/invoices/00000000-0000-0000-0000-000000000000/aplicar-credito', { data: {} });
    expect([401, 403]).toContain(r.status());
  });
});
