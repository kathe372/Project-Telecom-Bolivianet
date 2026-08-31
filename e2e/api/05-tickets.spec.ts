import { test, expect, APIRequestContext } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, estado, sobre, zzNombre } from './arnes';

/**
 * Módulo Tickets — 30 casos.
 *
 * El módulo más grande (32 endpoints) y el que más reglas de estado tiene. Los
 * casos se concentran en dos sitios: la identidad de quien reporta —un ticket
 * sin cliente exige nombre Y cédula del prospecto, para que no queden
 * incidencias anónimas— y las transiciones de estado, que son las que el
 * dominio protege desde E-04.
 */
test.describe('Tickets', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let clienteId: string;
  let ticketId: string;
  const INEXISTENTE = '00000000-0000-0000-0000-000000000000';

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    clienteId = estado().clienteId;

    const r = await admin.post('/api/tickets', {
      data: {
        ClientId: clienteId, Subject: 'ZZ Ticket base',
        Description: 'Ticket creado por la suite E2E.',
        Type: 'SoporteTecnico', Priority: 'Media',
      },
    });
    if (r.status() < 300) ticketId = (await r.json()).data?.Id ?? '';
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  const nuevoTicket = (extra: Record<string, unknown> = {}) => ({
    ClientId: clienteId, Subject: 'ZZ Asunto de prueba',
    Description: 'Descripción de prueba.',
    Type: 'SoporteTecnico', Priority: 'Media', ...extra,
  });

  // ── Autorización ──────────────────────────────────────────────────────────

  test('01 · listar tickets sin sesión se rechaza', async () => {
    expect((await anon.get('/api/tickets')).status()).toBe(401);
  });

  test('02 · crear un ticket sin sesión se rechaza', async () => {
    expect((await anon.post('/api/tickets', { data: nuevoTicket() })).status()).toBe(401);
  });

  test('03 · un Técnico SÍ puede listar tickets', async () => {
    expect((await tecnico.get('/api/tickets')).status()).toBe(200);
  });

  test('04 · un Técnico SÍ puede crear un ticket', async () => {
    const r = await tecnico.post('/api/tickets', { data: nuevoTicket() });
    expect(r.status()).toBeLessThan(300);
  });

  test('05 · un Técnico NO puede asignar tickets', async () => {
    // Repartir carga entre técnicos es decisión de coordinación.
    test.skip(!ticketId, 'no hay ticket base');
    const r = await tecnico.patch(`/api/tickets/${ticketId}/assign`, {
      data: { AssignedToUserId: estado().tecnicoId },
    });
    expect([401, 403]).toContain(r.status());
  });

  test('06 · un Técnico NO puede cerrar tickets', async () => {
    test.skip(!ticketId, 'no hay ticket base');
    const r = await tecnico.patch(`/api/tickets/${ticketId}/close`, { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('07 · un Técnico NO puede reabrir tickets', async () => {
    test.skip(!ticketId, 'no hay ticket base');
    const r = await tecnico.post(`/api/tickets/${ticketId}/reopen`, { data: { Reason: 'x' } });
    expect([401, 403]).toContain(r.status());
  });

  test('08 · un Técnico NO puede crear planes de SLA', async () => {
    const r = await tecnico.post('/api/tickets/sla-plans', { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('09 · un Técnico SÍ puede consultar los planes de SLA', async () => {
    expect((await tecnico.get('/api/tickets/sla-plans')).status()).toBe(200);
  });

  // ── Lectura ───────────────────────────────────────────────────────────────

  test('10 · el listado responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/tickets'));
    expect(s.success).toBe(true);
  });

  test('11 · el listado viene paginado', async () => {
    const s = await sobre(await admin.get('/api/tickets?PageNumber=1&PageSize=5'));
    const items = s.data.Items ?? s.data;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(5);
  });

  test('12 · el tablero kanban responde', async () => {
    expect((await admin.get('/api/tickets/kanban')).status()).toBe(200);
  });

  test('13 · los KPI de tickets responden', async () => {
    expect((await admin.get('/api/tickets/kpi')).status()).toBe(200);
  });

  test('14 · los tickets fuera de SLA responden', async () => {
    expect((await admin.get('/api/tickets/overdue-sla')).status()).toBe(200);
  });

  test('15 · las alertas de SLA responden', async () => {
    expect((await admin.get('/api/tickets/sla-alerts')).status()).toBe(200);
  });

  test('16 · los tipos de ticket se pueden consultar', async () => {
    expect((await admin.get('/api/tickets/types')).status()).toBe(200);
  });

  test('17 · los tickets de un cliente se consultan por su id', async () => {
    expect((await admin.get(`/api/tickets/by-client/${clienteId}`)).status()).toBe(200);
  });

  test('18 · un ticket inexistente da 404, no 500', async () => {
    const r = await admin.get('/api/tickets/00000000-0000-0000-0000-000000000000');
    expect(r.status()).toBe(404);
  });

  test('19 · el ticket base se puede leer', async () => {
    test.skip(!ticketId, 'no hay ticket base');
    const s = await sobre(await admin.get(`/api/tickets/${ticketId}`));
    expect(s.data.Id).toBe(ticketId);
  });

  test('20 · el informe de SLA responde', async () => {
    expect((await admin.get('/api/tickets/sla-report')).status()).toBe(200);
  });

  // ── Validación ────────────────────────────────────────────────────────────

  test('21 · un ticket sin asunto se rechaza', async () => {
    const r = await admin.post('/api/tickets', { data: nuevoTicket({ Subject: '' }) });
    expect(r.status()).toBe(400);
  });

  test('22 · un asunto de menos de 3 caracteres se rechaza', async () => {
    const r = await admin.post('/api/tickets', { data: nuevoTicket({ Subject: 'ab' }) });
    expect(r.status()).toBe(400);
  });

  test('23 · un ticket sin descripción se rechaza', async () => {
    const r = await admin.post('/api/tickets', { data: nuevoTicket({ Description: '' }) });
    expect(r.status()).toBe(400);
  });

  test('24 · una descripción de más de 1000 caracteres se rechaza', async () => {
    const r = await admin.post('/api/tickets', { data: nuevoTicket({ Description: 'x'.repeat(1001) }) });
    expect(r.status()).toBe(400);
  });

  test('25 · un tipo de ticket inventado se rechaza', async () => {
    const r = await admin.post('/api/tickets', { data: nuevoTicket({ Type: 'NoExisteEsteTipo' }) });
    expect(r.status()).toBe(400);
  });

  test('26 · una prioridad inventada se rechaza', async () => {
    const r = await admin.post('/api/tickets', { data: nuevoTicket({ Priority: 'Urgentisima' }) });
    expect(r.status()).toBe(400);
  });

  test('27 · un ticket sin cliente Y sin prospecto se rechaza', async () => {
    // La regla que impide incidencias anónimas: o hay ficha, o hay identidad.
    const r = await admin.post('/api/tickets', {
      data: nuevoTicket({ ClientId: null, ProspectName: null }),
    });
    expect(r.status()).toBe(400);
  });

  test('28 · un prospecto sin cédula se rechaza', async () => {
    // Nombre solo no basta: sin CI no hay a quién volver si el caso escala.
    const r = await admin.post('/api/tickets', {
      data: nuevoTicket({
        ClientId: null, ProspectName: zzNombre('Prospecto'),
        ProspectPhone: '70000000', ProspectIdentityCard: null,
      }),
    });
    expect(r.status()).toBe(400);
  });

  test('29 · un SLA de 0 horas se rechaza', async () => {
    const r = await admin.post('/api/tickets', { data: nuevoTicket({ SlaDurationHours: 0 }) });
    expect(r.status()).toBe(400);
  });

  // ── Estado ────────────────────────────────────────────────────────────────

  test('30 · resolver un ticket SIN mensaje se rechaza', async () => {
    // Regla del dominio (E-04): el texto de resolución es lo que se consulta
    // cuando el mismo problema vuelve. Resolver sin explicarlo lo pierde.
    test.skip(!ticketId, 'no hay ticket base');
    const r = await admin.patch(`/api/tickets/${ticketId}/status`, {
      data: { Status: 'Resuelto', ResolutionMessage: '' },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  // ── Superficie que la medición de cobertura señaló sin tocar ──────────────
  //
  // Dieciséis endpoints de este controlador no recibían una sola petición. Lo
  // que sigue los cubre. No repiten la lógica ya probada arriba: comprueban lo
  // que más barato se pierde en un endpoint nuevo —que exija sesión, que un id
  // inexistente no reviente, y que la validación mínima exista—.

  test('31 · comentar un ticket sin sesión se rechaza', async () => {
    const r = await anon.post(`/api/tickets/${INEXISTENTE}/comments`, { data: { Body: 'x' } });
    expect(r.status()).toBe(401);
  });

  test('32 · un comentario vacío se rechaza', async () => {
    test.skip(!ticketId, 'no hay ticket base');
    const r = await admin.post(`/api/tickets/${ticketId}/comments`, { data: { Body: '' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('33 · un comentario válido se guarda y aparece en el ticket', async () => {
    // Ojo: NO aparece en `/activity`. Ese endpoint devuelve el registro de
    // auditoría —quién creó, asignó o cambió el estado—, que es un flujo
    // distinto del hilo de comentarios. Los comentarios viajan dentro del
    // detalle del ticket, en `Comments`.
    test.skip(!ticketId, 'no hay ticket base');
    const texto = `ZZ comentario ${Date.now()}`;
    const r = await admin.post(`/api/tickets/${ticketId}/comments`, { data: { Body: texto } });
    expect(r.status()).toBeLessThan(300);

    const d = await sobre(await admin.get(`/api/tickets/${ticketId}`));
    expect((d.data.Comments ?? []).some((c: any) => c.Body === texto)).toBe(true);
  });

  test('34 · la actividad de un ticket responde', async () => {
    test.skip(!ticketId, 'no hay ticket base');
    expect((await admin.get(`/api/tickets/${ticketId}/activity`)).status()).toBe(200);
  });

  test('35 · registrar trabajo sin sesión se rechaza', async () => {
    const r = await anon.post(`/api/tickets/${INEXISTENTE}/worklogs`, { data: {} });
    expect(r.status()).toBe(401);
  });

  test('36 · un parte de trabajo con minutos negativos se rechaza', async () => {
    // Restar tiempo trabajado falsearía el coste real de atender la incidencia.
    test.skip(!ticketId, 'no hay ticket base');
    const r = await admin.post(`/api/tickets/${ticketId}/worklogs`, {
      data: { Minutes: -30, Description: 'Imposible.' },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('37 · los adjuntos de un ticket responden', async () => {
    test.skip(!ticketId, 'no hay ticket base');
    expect((await admin.get(`/api/tickets/${ticketId}/attachments`)).status()).toBe(200);
  });

  test('38 · subir un adjunto sin sesión se rechaza', async () => {
    const r = await anon.post(`/api/tickets/${INEXISTENTE}/attachments`, {
      multipart: { file: { name: 'zz.txt', mimeType: 'text/plain', buffer: Buffer.from('zz') } },
    });
    expect(r.status()).toBe(401);
  });

  test('39 · borrar un adjunto inexistente no rompe el servidor', async () => {
    test.skip(!ticketId, 'no hay ticket base');
    const r = await admin.delete(`/api/tickets/${ticketId}/attachments/${INEXISTENTE}`);
    expect(r.status()).toBeLessThan(500);
  });

  test('40 · descargar un adjunto inexistente da 404, no 500', async () => {
    test.skip(!ticketId, 'no hay ticket base');
    const r = await admin.get(`/api/tickets/${ticketId}/attachments/${INEXISTENTE}/download`);
    expect([400, 404]).toContain(r.status());
  });

  test('41 · las franjas de visita de un ticket responden', async () => {
    test.skip(!ticketId, 'no hay ticket base');
    const r = await admin.get(`/api/tickets/${ticketId}/visit-slots`);
    expect(r.status()).toBeLessThan(500);
  });

  test('42 · agendar una visita sin sesión se rechaza', async () => {
    const r = await anon.post(`/api/tickets/${INEXISTENTE}/visits`, { data: {} });
    expect(r.status()).toBe(401);
  });

  test('43 · agendar una visita en el pasado se rechaza', async () => {
    // Agendar hacia atrás no agenda nada: es un error de tecleo que deja al
    // cliente esperando una visita que nadie tenía apuntada.
    test.skip(!ticketId, 'no hay ticket base');
    const ayer = new Date(Date.now() - 3 * 864e5).toISOString();
    const r = await admin.post(`/api/tickets/${ticketId}/visits`, { data: { ScheduledAt: ayer } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('44 · reprogramar un ticket inexistente no rompe el servidor', async () => {
    const r = await admin.patch(`/api/tickets/${INEXISTENTE}/reschedule`, {
      data: { Fecha: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), Hora: '10:00' },
    });
    expect(r.status()).toBeLessThan(500);
  });

  test('45 · modificar un ticket con descripción demasiado corta se rechaza', async () => {
    test.skip(!ticketId, 'no hay ticket base');
    const r = await admin.put(`/api/tickets/${ticketId}`, { data: { Description: 'ab' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('46 · el balanceo de carga entre técnicos responde', async () => {
    expect((await admin.get('/api/tickets/balanceo')).status()).toBe(200);
  });

  test('47 · el recuento reciente por cliente responde', async () => {
    const r = await admin.get(`/api/tickets/by-client/${clienteId}/recent-count?type=SoporteTecnico`);
    expect(r.status()).toBeLessThan(500);
  });

  test('48 · un CSAT fuera del rango 1–5 se rechaza', async () => {
    // La satisfacción alimenta un KPI: un 99 lo desvirtúa sin que nadie lo note.
    test.skip(!ticketId, 'no hay ticket base');
    const r = await admin.patch(`/api/tickets/${ticketId}/csat`, { data: { Score: 99 } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('49 · un Técnico NO puede modificar planes de SLA', async () => {
    const r = await tecnico.put(`/api/tickets/sla-plans/${INEXISTENTE}`, { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('50 · un Técnico NO puede borrar planes de SLA', async () => {
    const r = await tecnico.delete(`/api/tickets/sla-plans/${INEXISTENTE}`);
    expect([401, 403]).toContain(r.status());
  });
});
