import { test, expect, APIRequestContext } from '@playwright/test';
import {
  comoAdmin, comoTecnico, sinSesion, estado, sobre,
  zzNombre, documentoUnico, telefonoUnico,
} from './arnes';

/**
 * Módulo Clientes — 30 casos.
 *
 * Es el módulo del que cuelgan facturación, tickets e instalaciones, así que
 * sus reglas de identidad (CI y teléfono únicos, formato del nombre) protegen
 * mucho más que a sí mismas: un cliente duplicado se convierte en facturas
 * duplicadas.
 */
test.describe('Clientes', () => {
  let admin: APIRequestContext;
  let tecnico: APIRequestContext;
  let anon: APIRequestContext;
  let clienteId: string;
  let planId: string;
  let adminId: string;
  let telefonoBase: string;

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    const e = estado();
    clienteId = e.clienteId; planId = e.planId; adminId = e.adminId;
    telefonoBase = e.clienteTelefono;
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  const nuevoCliente = (extra: Record<string, unknown> = {}) => ({
    FullName: zzNombre('Cliente'),
    IdentityCard: documentoUnico(),
    PhoneMain: telefonoUnico(),
    PhoneSecondary: null,
    Zone: 'ZZ Zona', Street: 'Calle', LocationRef: null,
    GpsLatitude: null, GpsLongitude: null,
    WinboxNumber: documentoUnico(),
    InstallationDate: new Date().toISOString(),
    InstalledByUserId: adminId,
    PlanId: planId,
    HasTvCable: false, OnuSerialNumber: null,
    InstallationCost: 0, PaidInstallation: true, PaidFirstMonth: false,
    PaymentMethod: 'Efectivo', Bank: null, PhysicalReceiptNumber: null,
    ...extra,
  });

  // ── Autorización ──────────────────────────────────────────────────────────

  test('01 · listar clientes sin sesión se rechaza', async () => {
    expect((await anon.get('/api/clients')).status()).toBe(401);
  });

  test('02 · ver un cliente sin sesión se rechaza', async () => {
    expect((await anon.get(`/api/clients/${clienteId}`)).status()).toBe(401);
  });

  test('03 · crear un cliente sin sesión se rechaza', async () => {
    expect((await anon.post('/api/clients', { data: nuevoCliente() })).status()).toBe(401);
  });

  test('04 · un Técnico SÍ puede listar clientes', async () => {
    expect((await tecnico.get('/api/clients')).status()).toBe(200);
  });

  test('05 · un Técnico SÍ puede registrar un cliente', async () => {
    // Es quien está en campo cuando se instala: negarle esto rompería el flujo.
    const r = await tecnico.post('/api/clients', { data: nuevoCliente() });
    expect(r.status()).toBeLessThan(300);
  });

  test('06 · un Técnico NO puede editar un cliente', async () => {
    const r = await tecnico.put(`/api/clients/${clienteId}`, { data: nuevoCliente() });
    expect([401, 403]).toContain(r.status());
  });

  test('07 · un Técnico NO puede suspender un cliente', async () => {
    const r = await tecnico.put(`/api/clients/${clienteId}/suspend`);
    expect([401, 403]).toContain(r.status());
  });

  test('08 · un Técnico NO puede dar de baja un cliente', async () => {
    const r = await tecnico.put(`/api/clients/${clienteId}/cancel?confirmed=true`);
    expect([401, 403]).toContain(r.status());
  });

  // ── Lectura ───────────────────────────────────────────────────────────────

  test('09 · el listado responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/clients'));
    expect(s.success).toBe(true);
  });

  test('10 · el listado viene paginado', async () => {
    const s = await sobre(await admin.get('/api/clients?PageNumber=1&PageSize=5'));
    const items = s.data.Items ?? s.data;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(typeof s.data.TotalCount).toBe('number');
  });

  test('11 · pedir la página 2 no devuelve lo mismo que la 1', async () => {
    const p1 = await sobre(await admin.get('/api/clients?PageNumber=1&PageSize=1'));
    const p2 = await sobre(await admin.get('/api/clients?PageNumber=2&PageSize=1'));
    const a = (p1.data.Items ?? [])[0], b = (p2.data.Items ?? [])[0];
    expect(a && b, 'hacen falta al menos 2 clientes para comprobar la paginación').toBeTruthy();
    expect(a.Id).not.toBe(b.Id);
  });

  test('11b · un parámetro de paginación mal escrito se ignora en SILENCIO', async () => {
    // Documenta una trampa real: `page` no es el nombre (es `PageNumber`), y
    // ASP.NET descarta lo que no reconoce sin avisar. El efecto es que quien se
    // equivoca recibe siempre la página 1 y cree que la paginación está rota.
    // Me pasó escribiendo estas pruebas.
    const p1 = await sobre(await admin.get('/api/clients?page=1&pageSize=1'));
    const p2 = await sobre(await admin.get('/api/clients?page=2&pageSize=1'));
    expect((p1.data.Items ?? [])[0].Id).toBe((p2.data.Items ?? [])[0].Id);
  });

  test('12 · consultar un cliente por id lo devuelve', async () => {
    const s = await sobre(await admin.get(`/api/clients/${clienteId}`));
    expect(s.data.Id).toBe(clienteId);
  });

  test('13 · un id inexistente da 404, no 500', async () => {
    const r = await admin.get('/api/clients/00000000-0000-0000-0000-000000000000');
    expect(r.status()).toBe(404);
  });

  test('14 · buscar por teléfono encuentra al cliente', async () => {
    const s = await sobre(await admin.get(`/api/clients/by-phone?phone=${telefonoBase}`));
    expect(s.data).toBeTruthy();
  });

  test('15 · buscar por un teléfono inexistente no rompe', async () => {
    const r = await admin.get('/api/clients/by-phone?phone=70000001');
    expect([200, 204, 404]).toContain(r.status());
  });

  test('16 · el siguiente código TBN se puede consultar', async () => {
    expect((await admin.get('/api/clients/next-tbn')).status()).toBe(200);
  });

  test('17 · las facturas de un cliente se consultan por su id', async () => {
    expect((await admin.get(`/api/clients/${clienteId}/invoices`)).status()).toBe(200);
  });

  test('18 · el historial del cliente responde', async () => {
    expect((await admin.get(`/api/clients/${clienteId}/historial`)).status()).toBe(200);
  });

  test('19 · los adjuntos del cliente responden', async () => {
    expect((await admin.get(`/api/clients/${clienteId}/attachments`)).status()).toBe(200);
  });

  // ── Reglas de identidad ───────────────────────────────────────────────────

  test('20 · un nombre con dígitos se rechaza', async () => {
    const r = await admin.post('/api/clients', { data: nuevoCliente({ FullName: 'Cliente 123' }) });
    expect(r.status()).toBe(400);
  });

  test('21 · un nombre vacío se rechaza', async () => {
    const r = await admin.post('/api/clients', { data: nuevoCliente({ FullName: '' }) });
    expect(r.status()).toBe(400);
  });

  test('22 · un teléfono con letras se rechaza', async () => {
    const r = await admin.post('/api/clients', { data: nuevoCliente({ PhoneMain: 'no-es-tel' }) });
    expect(r.status()).toBe(400);
  });

  test('23 · un teléfono demasiado corto se rechaza', async () => {
    const r = await admin.post('/api/clients', { data: nuevoCliente({ PhoneMain: '123' }) });
    expect(r.status()).toBe(400);
  });

  test('24 · un CI con caracteres raros se rechaza', async () => {
    const r = await admin.post('/api/clients', { data: nuevoCliente({ IdentityCard: '¡¿@#!' }) });
    expect(r.status()).toBe(400);
  });

  test('25 · una zona vacía se rechaza', async () => {
    const r = await admin.post('/api/clients', { data: nuevoCliente({ Zone: '' }) });
    expect(r.status()).toBe(400);
  });

  test('26 · una fecha de instalación futura se rechaza', async () => {
    // Instalar en el futuro no significa nada: o se instaló, o está agendada.
    const futuro = new Date(Date.now() + 30 * 864e5).toISOString();
    const r = await admin.post('/api/clients', { data: nuevoCliente({ InstallationDate: futuro }) });
    expect(r.status()).toBe(400);
  });

  test('27 · un costo de instalación negativo se rechaza', async () => {
    const r = await admin.post('/api/clients', { data: nuevoCliente({ InstallationCost: -100 }) });
    expect(r.status()).toBe(400);
  });

  test('28 · un método de pago inventado se rechaza', async () => {
    const r = await admin.post('/api/clients', {
      data: nuevoCliente({ PaidInstallation: true, PaymentMethod: 'Criptomonedas' }),
    });
    expect(r.status()).toBe(400);
  });

  test('29 · pagar por depósito sin indicar banco se rechaza', async () => {
    // Sin banco, el depósito no se puede conciliar después.
    const r = await admin.post('/api/clients', {
      data: nuevoCliente({ PaidInstallation: true, PaymentMethod: 'DepositoBancario', Bank: null }),
    });
    expect(r.status()).toBe(400);
  });

  test('30 · un cliente creado aparece luego en su propia consulta', async () => {
    // Contraprueba de todo lo anterior: comprobar que el camino bueno funciona.
    const s = await sobre(await admin.post('/api/clients', { data: nuevoCliente() }));
    expect(s.data.Id).toBeTruthy();
    const leido = await sobre(await admin.get(`/api/clients/${s.data.Id}`));
    expect(leido.data.Id).toBe(s.data.Id);
  });

  // ── Superficie que la medición de cobertura señaló sin tocar ──────────────

  test('31 · la búsqueda de clientes sin sesión se rechaza', async () => {
    expect((await anon.post('/api/clients/search', { data: { Query: 'zz' } })).status()).toBe(401);
  });

  test('32 · la búsqueda responde para un término cualquiera', async () => {
    const r = await admin.post('/api/clients/search', { data: { Query: 'ZZ' } });
    expect(r.status()).toBeLessThan(400);
  });

  test('33 · buscar todas las fichas de un teléfono responde', async () => {
    // Un mismo teléfono puede tener varias fichas: es el caso que el chatbot
    // resuelve preguntando «¿cuál de estas cuentas?».
    const r = await admin.get(`/api/clients/by-phone-all?phone=${telefonoBase}`);
    expect(r.status()).toBe(200);
  });

  test('34 · las facturas en formato para el bot responden', async () => {
    expect((await admin.get(`/api/clients/${clienteId}/invoices/bot`)).status()).toBe(200);
  });

  test('35 · reactivar un cliente sin sesión se rechaza', async () => {
    expect((await anon.put(`/api/clients/${clienteId}/reactivate`)).status()).toBe(401);
  });

  test('36 · un Técnico NO puede reactivar un cliente', async () => {
    // Reactivar reanuda la facturación: es decisión administrativa.
    const r = await tecnico.put(`/api/clients/${clienteId}/reactivate`);
    expect([401, 403]).toContain(r.status());
  });

  test('37 · registrar un pago desde la ficha sin sesión se rechaza', async () => {
    const r = await anon.post(`/api/clients/${clienteId}/payments`, { data: {} });
    expect(r.status()).toBe(401);
  });

  test('38 · un pago de importe negativo desde la ficha se rechaza', async () => {
    const r = await admin.post(`/api/clients/${clienteId}/payments`, {
      data: {
        ClientId: clienteId, Amount: -10, Method: 'Efectivo',
        PaidAt: new Date().toISOString(), InvoiceIds: [],
      },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('39 · subir un adjunto sin sesión se rechaza', async () => {
    const r = await anon.post(`/api/clients/${clienteId}/attachments`, {
      multipart: { file: { name: 'zz.txt', mimeType: 'text/plain', buffer: Buffer.from('zz') } },
    });
    expect(r.status()).toBe(401);
  });

  test('40 · un Técnico NO puede borrar adjuntos de un cliente', async () => {
    const r = await tecnico.delete(
      `/api/clients/${clienteId}/attachments/00000000-0000-0000-0000-000000000000`);
    expect([401, 403]).toContain(r.status());
  });

  test('41 · descargar un adjunto inexistente da 404, no 500', async () => {
    const r = await admin.get(
      `/api/clients/${clienteId}/attachments/00000000-0000-0000-0000-000000000000/download`);
    expect([400, 404]).toContain(r.status());
  });

  test('42 · reembolsar crédito sin sesión se rechaza', async () => {
    // Devuelve dinero al cliente: de las operaciones más sensibles que hay.
    const r = await anon.post(`/api/clients/${clienteId}/credit/reembolsar`, {
      data: { Monto: 10 },
    });
    expect(r.status()).toBe(401);
  });

  test('43 · reembolsar más crédito del disponible se rechaza', async () => {
    const r = await admin.post(`/api/clients/${clienteId}/credit/reembolsar`, {
      data: { Monto: 999999, Motivo: 'Prueba de la suite E2E.' },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });
});
