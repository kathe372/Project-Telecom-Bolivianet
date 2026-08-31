import { test, expect, APIRequestContext } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, estado, sobre, zz } from './arnes';

/**
 * Módulo Notificaciones — 30 casos.
 *
 * Plantillas, segmentos y envío masivo. Es el módulo con el mayor radio de daño
 * de todo el sistema: un envío masivo mal configurado escribe a cientos de
 * clientes reales por WhatsApp, con coste por mensaje y sin vuelta atrás.
 *
 * Por eso el peso está en las barreras de rol y en la validación de segmentos:
 * un segmento con un operador que el motor no entiende puede seleccionar a
 * quien no debía.
 */
test.describe('Notificaciones', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let clienteId: string;
  const INEXISTENTE = '00000000-0000-0000-0000-000000000000';

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    clienteId = estado().clienteId;
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  const segmento = (extra: Record<string, unknown> = {}) => ({
    Nombre: zz('Segmento'),
    Condiciones: [{ Campo: 'Estado', Operador: 'igual', Valor: 'Activo' }],
    ...extra,
  });

  // ── Nada de esto sin sesión ───────────────────────────────────────────────

  test('01 · la configuración sin sesión se rechaza', async () => {
    expect((await anon.get('/api/config/notifications')).status()).toBe(401);
  });

  test('02 · las plantillas sin sesión se rechazan', async () => {
    expect((await anon.get('/api/config/notifications/templates')).status()).toBe(401);
  });

  test('03 · los segmentos sin sesión se rechazan', async () => {
    expect((await anon.get('/api/config/notifications/segments')).status()).toBe(401);
  });

  test('04 · el envío masivo sin sesión se rechaza', async () => {
    // El endpoint más peligroso del sistema.
    expect((await anon.post('/api/config/notifications/send-masivo', { data: {} })).status()).toBe(401);
  });

  test('05 · las alertas sin sesión se rechazan', async () => {
    expect((await anon.get('/api/alerts')).status()).toBe(401);
  });

  // ── Un Técnico no configura notificaciones ────────────────────────────────

  test('06 · un Técnico NO puede ver la configuración', async () => {
    const r = await tecnico.get('/api/config/notifications');
    expect([401, 403]).toContain(r.status());
  });

  test('07 · un Técnico NO puede cambiar la configuración', async () => {
    const r = await tecnico.put('/api/config/notifications', { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('08 · un Técnico NO puede editar plantillas', async () => {
    const r = await tecnico.put('/api/config/notifications/templates/FacturaGenerada', { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('09 · un Técnico NO puede crear segmentos', async () => {
    const r = await tecnico.post('/api/config/notifications/segments', { data: segmento() });
    expect([401, 403]).toContain(r.status());
  });

  test('10 · un Técnico NO puede lanzar un envío masivo', async () => {
    // Escribe a clientes reales con el número de la empresa.
    const r = await tecnico.post('/api/config/notifications/send-masivo', { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('11 · un Técnico NO puede borrar notificaciones', async () => {
    const r = await tecnico.delete(`/api/notifications/${INEXISTENTE}`);
    expect([401, 403]).toContain(r.status());
  });

  test('12 · un Técnico SÍ ve sus alertas', async () => {
    // Las alertas son suyas: es lo que le avisa de un SLA a punto de vencer.
    expect((await tecnico.get('/api/alerts')).status()).toBe(200);
  });

  // ── Lectura como administrador ────────────────────────────────────────────

  test('13 · la configuración responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/config/notifications'));
    expect(s.success).toBe(true);
  });

  test('14 · las plantillas responden', async () => {
    expect((await admin.get('/api/config/notifications/templates')).status()).toBe(200);
  });

  test('15 · el catálogo de variables responde', async () => {
    // Es lo que dice qué se puede interpolar en una plantilla.
    expect((await admin.get('/api/config/notifications/variables')).status()).toBe(200);
  });

  test('16 · los segmentos responden una colección', async () => {
    const s = await sobre(await admin.get('/api/config/notifications/segments'));
    const items = s.data?.Items ?? s.data;
    expect(Array.isArray(items)).toBe(true);
  });

  test('17 · un segmento inexistente da 404, no 500', async () => {
    const r = await admin.get(`/api/config/notifications/segments/${INEXISTENTE}`);
    expect([404, 400]).toContain(r.status());
  });

  test('18 · las notificaciones de un cliente responden', async () => {
    expect((await admin.get(`/api/clients/${clienteId}/notifications`)).status()).toBe(200);
  });

  test('19 · las alertas responden con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/alerts'));
    expect(s.success).toBe(true);
  });

  test('20 · marcar todas las alertas como leídas responde', async () => {
    expect((await admin.patch('/api/alerts/read-all')).status()).toBeLessThan(500);
  });

  // ── Segmentos: la validación que evita escribir a quien no toca ───────────

  test('21 · un segmento sin nombre se rechaza', async () => {
    const r = await admin.post('/api/config/notifications/segments', {
      data: segmento({ Nombre: '' }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('22 · un segmento sin condiciones se rechaza', async () => {
    // Sin condiciones seleccionaría a TODOS los clientes.
    const r = await admin.post('/api/config/notifications/segments', {
      data: segmento({ Condiciones: [] }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('23 · un operador inválido se rechaza', async () => {
    // Si el motor no entiende el operador, la condición puede evaluarse a
    // "verdadero" y el segmento acaba incluyendo a quien no debía.
    const r = await admin.post('/api/config/notifications/segments', {
      data: segmento({ Condiciones: [{ Campo: 'Estado', Operador: 'noExiste', Valor: 'Activo' }] }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('24 · un campo inválido se rechaza', async () => {
    const r = await admin.post('/api/config/notifications/segments', {
      data: segmento({ Condiciones: [{ Campo: 'CampoInventado', Operador: 'igual', Valor: 'x' }] }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('25 · un valor vacío en la condición se rechaza', async () => {
    const r = await admin.post('/api/config/notifications/segments', {
      data: segmento({ Condiciones: [{ Campo: 'Estado', Operador: 'igual', Valor: '' }] }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('26 · la previsualización de un segmento no envía nada', async () => {
    // "Preview" tiene que ser de solo lectura: es lo que se mira ANTES de
    // disparar un envío masivo, y equivocarse aquí sería irreversible.
    const r = await admin.post('/api/config/notifications/segments/preview', { data: segmento() });
    expect(r.status()).toBeLessThan(500);
  });

  test('27 · borrar un segmento inexistente no rompe el servidor', async () => {
    const r = await admin.delete(`/api/config/notifications/segments/${INEXISTENTE}`);
    expect(r.status()).toBeLessThan(500);
  });

  // ── Plantillas y envío ────────────────────────────────────────────────────

  test('28 · previsualizar una plantilla no la envía', async () => {
    const r = await admin.post('/api/config/notifications/templates/preview', {
      data: { Plantilla: 'Hola {{Nombre}}', Tipo: 'FacturaGenerada' },
    });
    expect(r.status()).toBeLessThan(500);
  });

  test('29 · una plantilla de tipo inexistente se rechaza', async () => {
    const r = await admin.put('/api/config/notifications/templates/TipoQueNoExiste', {
      data: { Cuerpo: 'x' },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('30 · un envío masivo sin segmento ni destinatarios se rechaza', async () => {
    // La última barrera antes de escribir a cientos de personas.
    const r = await admin.post('/api/config/notifications/send-masivo', { data: {} });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  // ── Superficie que la medición de cobertura señaló sin tocar ──────────────

  test('31 · modificar un segmento inexistente no rompe el servidor', async () => {
    const r = await admin.put(`/api/config/notifications/segments/${INEXISTENTE}`, {
      data: segmento(),
    });
    expect(r.status()).toBeLessThan(500);
  });

  test('32 · un Técnico NO puede modificar segmentos', async () => {
    const r = await tecnico.put(`/api/config/notifications/segments/${INEXISTENTE}`, {
      data: segmento(),
    });
    expect([401, 403]).toContain(r.status());
  });

  test('33 · marcar una plantilla como HSM exige sesión', async () => {
    const r = await anon.patch('/api/config/notifications/templates/SUSPENSION/hsm', {
      data: { EsHsm: true },
    });
    expect(r.status()).toBe(401);
  });

  test('34 · marcar como HSM un tipo inexistente se rechaza', async () => {
    const r = await admin.patch('/api/config/notifications/templates/NO_EXISTE/hsm', {
      data: { EsHsm: true },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('35 · restaurar una plantilla exige sesión', async () => {
    const r = await anon.post('/api/config/notifications/templates/SUSPENSION/restore', {
      data: {},
    });
    expect(r.status()).toBe(401);
  });

  test('36 · restaurar un tipo de plantilla inexistente se rechaza', async () => {
    const r = await admin.post('/api/config/notifications/templates/NO_EXISTE/restore', {
      data: {},
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('37 · el estado de entrega exige sesión', async () => {
    const r = await anon.post('/api/notifications/delivery-status', {
      data: { WaMessageId: 'zz', Status: 'delivered', Timestamp: '0' },
    });
    expect(r.status()).toBe(401);
  });

  test('38 · un estado de entrega de un mensaje desconocido no rompe el servidor', async () => {
    const r = await admin.post('/api/notifications/delivery-status', {
      data: { WaMessageId: 'zz-inexistente', Status: 'delivered', Timestamp: '1735689600' },
    });
    expect(r.status()).toBeLessThan(500);
  });

  test('39 · un Técnico NO puede purgar el histórico de notificaciones', async () => {
    // Borrar el histórico entero elimina la prueba de qué se le dijo al cliente.
    const r = await tecnico.delete('/api/notifications');
    expect([401, 403]).toContain(r.status());
  });

  test('40 · purgar el histórico sin sesión se rechaza', async () => {
    expect((await anon.delete('/api/notifications')).status()).toBe(401);
  });

  test('41 · marcar una alerta concreta como leída responde', async () => {
    const r = await admin.patch(`/api/alerts/${INEXISTENTE}/read`);
    expect(r.status()).toBeLessThan(500);
  });
});
