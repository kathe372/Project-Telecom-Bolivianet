import { test, expect, APIRequestContext, request as apiRequest } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, estado, sobre } from './arnes';

/**
 * Módulo Chatbot y conversaciones — 30 casos.
 *
 * Dos superficies distintas y conviene no confundirlas:
 *
 *  - El **backend** (`/api/conversaciones`, `/api/bot-config`, `/api/rag`), que
 *    es lo que usa el panel de operadores para intervenir una conversación.
 *  - El **servicio del chatbot** en :3001, que expone su propio `/health` y
 *    endpoints internos protegidos por token.
 *
 * El punto delicado es la toma de control: cuando un operador «toma» una
 * conversación, el bot debe callarse. Si esa barrera falla, el cliente recibe a
 * la vez una respuesta automática y otra de una persona.
 */
test.describe('Chatbot y conversaciones', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let telefono: string;
  const CHATBOT = 'http://localhost:3001';

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    telefono = estado().clienteTelefono;
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  /** Petición cruda al servicio del chatbot, sin sesión del backend. */
  async function alChatbot(metodo: 'get' | 'post', ruta: string, opciones: any = {}) {
    const ctx = await apiRequest.newContext();
    const r = await (ctx as any)[metodo](`${CHATBOT}${ruta}`, opciones);
    const res = { estado: r.status(), texto: await r.text() };
    await ctx.dispose();
    return res;
  }

  // ── Conversaciones: autorización ──────────────────────────────────────────

  test('01 · listar conversaciones sin sesión se rechaza', async () => {
    expect((await anon.get('/api/conversaciones')).status()).toBe(401);
  });

  test('02 · ver una conversación sin sesión se rechaza', async () => {
    expect((await anon.get(`/api/conversaciones/${telefono}`)).status()).toBe(401);
  });

  test('03 · tomar una conversación sin sesión se rechaza', async () => {
    expect((await anon.post(`/api/conversaciones/${telefono}/tomar`, { data: {} })).status()).toBe(401);
  });

  test('04 · responder sin sesión se rechaza', async () => {
    // Sin esta barrera, cualquiera escribiría a un cliente como si fuera la empresa.
    const r = await anon.post(`/api/conversaciones/${telefono}/responder`, { data: { Texto: 'hola' } });
    expect(r.status()).toBe(401);
  });

  test('05 · la configuración del bot sin sesión se rechaza', async () => {
    expect((await anon.get('/api/bot-config')).status()).toBe(401);
  });

  test('06 · los documentos RAG sin sesión se rechazan', async () => {
    expect((await anon.get('/api/rag/documents')).status()).toBe(401);
  });

  test('07 · un Técnico SÍ puede ver conversaciones', async () => {
    expect((await tecnico.get('/api/conversaciones')).status()).toBe(200);
  });

  test('08 · un Técnico NO puede cambiar la configuración del bot', async () => {
    // Cambiar el prompt del bot cambia lo que se le dice a TODOS los clientes.
    const r = await tecnico.put('/api/bot-config', { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('09 · un Técnico NO puede reiniciar la configuración del bot', async () => {
    const r = await tecnico.post('/api/bot-config/reset', { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('10 · un Técnico NO puede subir documentos RAG', async () => {
    // El RAG es la fuente de verdad del bot: quien lo escribe, dicta respuestas.
    //
    // Se manda multipart a propósito. Con un JSON el endpoint contesta 415
    // (tipo de medio no soportado) ANTES de mirar el rol, y un 415 no demuestra
    // que la autorización funcione: solo que el cuerpo no le gustó.
    const r = await tecnico.post('/api/rag/documents', {
      multipart: { file: { name: 'zz.txt', mimeType: 'text/plain', buffer: Buffer.from('zz') } },
    });
    expect([401, 403]).toContain(r.status());
  });

  test('11 · un Técnico NO puede borrar documentos RAG', async () => {
    const r = await tecnico.delete('/api/rag/documents/1');
    expect([401, 403]).toContain(r.status());
  });

  test('12 · un Técnico NO puede subir el QR de cobro de la empresa', async () => {
    // Sustituir ese QR desviaría los pagos de los clientes a otra cuenta.
    // Multipart por la misma razón que el caso 10: un 415 no probaría nada.
    const r = await tecnico.post('/api/bot-config/company-qr', {
      multipart: { file: { name: 'zz.png', mimeType: 'image/png', buffer: Buffer.from('zz') } },
    });
    expect([401, 403]).toContain(r.status());
  });

  // ── Conversaciones: lectura ───────────────────────────────────────────────

  test('13 · el listado responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/conversaciones'));
    expect(s.success).toBe(true);
  });

  test('14 · las estadísticas de conversación responden', async () => {
    expect((await admin.get('/api/conversaciones/stats')).status()).toBe(200);
  });

  test('15 · consultar una conversación inexistente no rompe el servidor', async () => {
    const r = await admin.get('/api/conversaciones/59100000099');
    expect(r.status()).toBeLessThan(500);
  });

  test('16 · un teléfono con letras no rompe el servidor', async () => {
    const r = await admin.get('/api/conversaciones/no-es-un-telefono');
    expect(r.status()).toBeLessThan(500);
  });

  test('17 · el cliente asociado a un teléfono se puede consultar', async () => {
    const r = await admin.get(`/api/conversaciones/cliente/${telefono}`);
    expect(r.status()).toBeLessThan(500);
  });

  test('18 · la configuración del bot responde', async () => {
    expect((await admin.get('/api/bot-config')).status()).toBe(200);
  });

  test('19 · la configuración pública del bot responde', async () => {
    expect((await admin.get('/api/bot-config/public')).status()).toBe(200);
  });

  test('20 · la configuración del bot NO expone la clave de Gemini', async () => {
    // La config viaja al panel; una clave de API ahí es una clave filtrada.
    const crudo = (await sobre(await admin.get('/api/bot-config'))).crudo;
    expect(crudo).not.toMatch(/AIza[0-9A-Za-z_\-]{30,}/);
    expect(crudo.toLowerCase()).not.toContain('gemini_api_key');
  });

  test('21 · la configuración pública NO expone secretos', async () => {
    const crudo = (await sobre(await admin.get('/api/bot-config/public'))).crudo;
    expect(crudo).not.toMatch(/AIza[0-9A-Za-z_\-]{30,}/);
    expect(crudo.toLowerCase()).not.toContain('apppsecret');
    expect(crudo).not.toMatch(/EAA[0-9A-Za-z]{50,}/);   // token de Meta
  });

  test('22 · los documentos RAG responden para el administrador', async () => {
    expect((await admin.get('/api/rag/documents')).status()).toBe(200);
  });

  // ── Toma y devolución de la conversación ──────────────────────────────────

  test('23 · tomar una conversación inexistente falla de forma CONTROLADA', async () => {
    // Responde 502 con un cuerpo explicativo, no una excepción sin manejar. El
    // backend hace de pasarela hacia el chatbot y ese 502 refleja que el de
    // abajo dijo que no. Discutible como código —un 404 describiría mejor «esa
    // conversación no existe»— pero el fallo está contenido y es informativo,
    // que es lo que esta prueba fija.
    const r = await admin.post('/api/conversaciones/59100000098/tomar', { data: {} });
    expect([400, 404, 409, 502]).toContain(r.status());
    expect(await r.text(), 'el fallo tiene que explicarse, no ser una página en blanco')
      .not.toBe('');
  });

  test('24 · devolver una conversación no tomada falla de forma CONTROLADA', async () => {
    const r = await admin.post('/api/conversaciones/59100000098/devolver', { data: {} });
    expect([400, 404, 409, 502]).toContain(r.status());
  });

  test('25 · responder con texto vacío se rechaza', async () => {
    const r = await admin.post(`/api/conversaciones/${telefono}/responder`, { data: { Texto: '' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  // ── El servicio del chatbot ───────────────────────────────────────────────

  test('26 · el chatbot está sano', async () => {
    const { estado } = await alChatbot('get', '/health');
    expect(estado).toBe(200);
  });

  test('27 · los endpoints de administración del chatbot exigen token', async () => {
    const { estado } = await alChatbot('get', '/monitor/conversations');
    expect(estado).toBe(401);
  });

  test('28 · un token interno equivocado se rechaza', async () => {
    const { estado } = await alChatbot('get', '/monitor/conversations', {
      headers: { Authorization: 'Bearer token-que-no-es' },
    });
    expect(estado).toBe(401);
  });

  test('29 · los endpoints de notificación del chatbot exigen token', async () => {
    const { estado } = await alChatbot('post', '/bot/notify-client', { data: {} });
    expect(estado).toBe(401);
  });

  test('30 · el chatbot NO acepta un webhook sin firma', async () => {
    // Comprobado también en e2e/03-webhook-firma.spec.ts con más detalle; aquí
    // se deja porque es la puerta de entrada del módulo y conviene que falle
    // este archivo si alguien la abre.
    const { estado } = await alChatbot('post', '/webhook', {
      data: { entry: [{ changes: [{ value: { messages: [{ from: '59100000097' }] } }] }] },
    });
    expect(estado).toBe(401);
  });

  // ── Superficie que la medición de cobertura señaló sin tocar ──────────────

  test('31 · el QR de cobro de la empresa se puede consultar', async () => {
    const r = await admin.get('/api/bot-config/company-qr');
    expect(r.status()).toBeLessThan(500);
  });

  test('32 · la info del QR de la empresa responde', async () => {
    const r = await admin.get('/api/bot-config/company-qr/info');
    expect(r.status()).toBeLessThan(500);
  });

  test('33 · el QR de la empresa sin sesión se rechaza', async () => {
    expect((await anon.get('/api/bot-config/company-qr')).status()).toBe(401);
  });
});
