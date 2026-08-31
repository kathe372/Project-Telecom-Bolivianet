import { test, expect, APIRequestContext } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, estado, sobre } from './arnes';

/**
 * Módulo Pagos — 30 casos.
 *
 * El más delicado del sistema: es donde entra el dinero. Dos cosas se vigilan
 * con especial insistencia —el registro duplicado (cobrar dos veces lo mismo) y
 * la anulación (sacar dinero del libro)—, porque son las que no se detectan
 * solas y aparecen al cuadrar caja.
 */
test.describe('Pagos', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let clienteId: string;
  const hoy = new Date().toISOString();

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    clienteId = estado().clienteId;
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  const pago = (extra: Record<string, unknown> = {}) => ({
    ClientId: clienteId, Amount: 100, Method: 'Efectivo', Bank: null,
    PaidAt: hoy, InvoiceIds: [], ...extra,
  });

  // ── Autorización ──────────────────────────────────────────────────────────

  test('01 · listar pagos sin sesión se rechaza', async () => {
    expect((await anon.get('/api/payments')).status()).toBe(401);
  });

  test('02 · un Técnico NO puede listar todos los pagos', async () => {
    const r = await tecnico.get('/api/payments');
    expect([401, 403]).toContain(r.status());
  });

  test('03 · un Técnico NO puede anular un pago', async () => {
    // Anular saca dinero del libro mayor: privilegio de administrador.
    const r = await tecnico.put(`/api/payments/${clienteId}/void`, { data: { Motivo: 'x' } });
    expect([401, 403]).toContain(r.status());
  });

  test('04 · un Técnico NO puede ver el informe de recaudación', async () => {
    const r = await tecnico.get('/api/payments/collection-report');
    expect([401, 403]).toContain(r.status());
  });

  test('05 · un Técnico NO puede ver el informe por operador', async () => {
    const r = await tecnico.get('/api/payments/report/by-operator');
    expect([401, 403]).toContain(r.status());
  });

  test('06 · un Técnico NO puede lanzar recordatorios de cobro', async () => {
    // Manda WhatsApp a clientes reales: tiene coste y cara visible.
    const r = await tecnico.post('/api/payments/send-reminders');
    expect([401, 403]).toContain(r.status());
  });

  test('07 · un Técnico SÍ puede comprobar duplicados', async () => {
    // Lo necesita antes de cobrar en campo; es de solo lectura.
    const r = await tecnico.get(
      `/api/payments/check-duplicate?clientId=${clienteId}&amount=100&paidAt=${hoy}`);
    expect(r.status()).toBe(200);
  });

  test('08 · anular un pago sin sesión se rechaza', async () => {
    expect((await anon.put(`/api/payments/${clienteId}/void`, { data: {} })).status()).toBe(401);
  });

  test('09 · el cierre de caja sin sesión se rechaza', async () => {
    expect((await anon.get('/api/payments/cash-close/active')).status()).toBe(401);
  });

  // ── Lectura ───────────────────────────────────────────────────────────────

  test('10 · el listado responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/payments'));
    expect(s.success).toBe(true);
  });

  test('11 · el listado viene paginado', async () => {
    const s = await sobre(await admin.get('/api/payments?PageNumber=1&PageSize=5'));
    const items = s.data.Items ?? s.data;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(5);
  });

  test('12 · un pago inexistente da 404, no 500', async () => {
    const r = await admin.get('/api/payments/00000000-0000-0000-0000-000000000000');
    expect(r.status()).toBe(404);
  });

  test('13 · un id que no es GUID no llega al handler', async () => {
    const r = await admin.get('/api/payments/esto-no-es-un-guid');
    expect([400, 404]).toContain(r.status());
  });

  test('14 · el informe de recaudación responde', async () => {
    expect((await admin.get('/api/payments/collection-report')).status()).toBe(200);
  });

  test('15 · el informe por operador responde', async () => {
    expect((await admin.get('/api/payments/report/by-operator')).status()).toBe(200);
  });

  test('16 · la caja activa se puede consultar', async () => {
    expect((await admin.get('/api/payments/cash-close/active')).status()).toBeLessThan(500);
  });

  test('17 · el histórico de cierres responde', async () => {
    expect((await admin.get('/api/payments/cash-close')).status()).toBe(200);
  });

  test('18 · la exportación CSV devuelve un archivo, no JSON', async () => {
    const r = await admin.get('/api/payments/report/export-csv');
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type'] ?? '').not.toContain('application/json');
  });

  test('19 · la comprobación de duplicados responde para un cliente real', async () => {
    const r = await admin.get(
      `/api/payments/check-duplicate?clientId=${clienteId}&amount=100&paidAt=${hoy}`);
    expect(r.status()).toBe(200);
  });

  test('19b · comprobar duplicados SIN fecha da 400, no 500', async () => {
    // Fallaba con ArgumentOutOfRangeException: al faltar el parámetro, el
    // enlace de modelos lo dejaba en DateTime.MinValue y el servicio le restaba
    // 3 días, por debajo de la fecha mínima representable. Un parámetro que
    // falta es una petición mal formada, no un error del servidor.
    const r = await admin.get(`/api/payments/check-duplicate?clientId=${clienteId}&amount=100`);
    expect(r.status()).toBe(400);
  });

  // ── Validación del registro ───────────────────────────────────────────────

  test('20 · un pago de importe cero se rechaza', async () => {
    const r = await admin.post('/api/payments/register-with-credit', { data: pago({ Amount: 0 }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('21 · un pago de importe negativo se rechaza', async () => {
    // Un importe negativo sería un cobro que devuelve dinero sin dejar rastro.
    const r = await admin.post('/api/payments/register-with-credit', { data: pago({ Amount: -50 }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('22 · un método de pago inventado se rechaza', async () => {
    const r = await admin.post('/api/payments/register-with-credit', {
      data: pago({ Method: 'Trueque' }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('23 · un método vacío se rechaza', async () => {
    const r = await admin.post('/api/payments/register-with-credit', { data: pago({ Method: '' }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('24 · depósito bancario sin banco se rechaza', async () => {
    const r = await admin.post('/api/payments/register-with-credit', {
      data: pago({ Method: 'DepositoBancario', Bank: null }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('25 · QR sin banco se rechaza', async () => {
    const r = await admin.post('/api/payments/register-with-credit', {
      data: pago({ Method: 'QR', Bank: null }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('26 · una fecha de pago futura se rechaza', async () => {
    // Cobrar mañana no existe; suele ser un error de tecleo que descuadra caja.
    const futuro = new Date(Date.now() + 10 * 864e5).toISOString();
    const r = await admin.post('/api/payments/register-with-credit', {
      data: pago({ PaidAt: futuro }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('27 · un pago sin cliente se rechaza', async () => {
    const r = await admin.post('/api/payments/register-with-credit', {
      data: pago({ ClientId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('28 · un pago sin facturas seleccionadas se rechaza', async () => {
    // Un pago que no se aplica a nada deja dinero sin imputar.
    const r = await admin.post('/api/payments/register-with-credit', {
      data: pago({ InvoiceIds: [] }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('29 · un cuerpo vacío se rechaza sin romper el servidor', async () => {
    const r = await admin.post('/api/payments/register-with-credit', { data: {} });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('30 · un pago rechazado NO deja rastro en el listado', async () => {
    // Lo que de verdad importa: que el 400 signifique "no pasó nada".
    const antes = await sobre(await admin.get('/api/payments?PageNumber=1&PageSize=1'));
    await admin.post('/api/payments/register-with-credit', { data: pago({ Amount: -999 }) });
    const despues = await sobre(await admin.get('/api/payments?PageNumber=1&PageSize=1'));
    expect(despues.data.TotalCount).toBe(antes.data.TotalCount);
  });

  // ── Superficie que la medición de cobertura señaló sin tocar ──────────────

  test('31 · cerrar la caja sin sesión se rechaza', async () => {
    expect((await anon.post('/api/payments/cash-close/close', { data: {} })).status()).toBe(401);
  });

  test('32 · cerrar la caja con cuerpo vacío no rompe el servidor', async () => {
    // El cierre de caja cuadra lo cobrado en el día: un cuerpo incompleto debe
    // rechazarse, nunca cerrar con datos a medias.
    const r = await admin.post('/api/payments/cash-close/close', { data: {} });
    expect(r.status()).toBeLessThan(500);
  });

  test('33 · el comprobante de un pago inexistente da 404, no 500', async () => {
    const r = await admin.get('/api/payments/00000000-0000-0000-0000-000000000000/receipt');
    expect([400, 404]).toContain(r.status());
  });

  test('34 · subir la imagen de un comprobante sin sesión se rechaza', async () => {
    const r = await anon.post('/api/payments/00000000-0000-0000-0000-000000000000/receipt-image', {
      multipart: { file: { name: 'zz.png', mimeType: 'image/png', buffer: Buffer.from('zz') } },
    });
    expect(r.status()).toBe(401);
  });

  test('35 · subir el comprobante de un pago inexistente no rompe el servidor', async () => {
    const r = await admin.post('/api/payments/00000000-0000-0000-0000-000000000000/receipt-image', {
      multipart: { file: { name: 'zz.png', mimeType: 'image/png', buffer: Buffer.from('zz') } },
    });
    expect(r.status()).toBeLessThan(500);
  });
});
