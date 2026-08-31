import { test, expect, APIRequestContext } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, sobre, zz } from './arnes';

/**
 * Módulo Horarios laborales y feriados — 30 casos.
 *
 * Seis endpoints que no tenían ninguna prueba de extremo a extremo, y que
 * deciden algo con consecuencias en cadena: **qué cuenta como hora hábil**. De
 * ahí salen los vencimientos de SLA de los tickets y las franjas que se ofrecen
 * para agendar instalaciones.
 *
 * Un feriado mal cargado, o una máscara de días laborables equivocada, no rompe
 * nada visiblemente: simplemente hace que un ticket venza cuando no debía, o que
 * se ofrezca una visita un domingo.
 */
test.describe('Horarios y feriados', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let horarioId = '';
  const INEXISTENTE = '00000000-0000-0000-0000-000000000000';

  // Lunes a viernes = bits 1..5 → 0b0111110 = 62.
  const LUN_A_VIE = 62;

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    const r = await admin.post('/api/business-schedules', {
      data: {
        Name: zz('Horario'), TimeZoneName: 'America/La_Paz', UtcOffsetHours: -4,
        WorkingDaysMask: LUN_A_VIE, StartHour: 8, EndHour: 18,
        Is24x7: false, IsDefault: false,
      },
    });
    if (r.status() < 300) horarioId = (await r.json()).data?.Id ?? '';
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  const nuevo = (extra: Record<string, unknown> = {}) => ({
    Name: zz('Horario'), TimeZoneName: 'America/La_Paz', UtcOffsetHours: -4,
    WorkingDaysMask: LUN_A_VIE, StartHour: 8, EndHour: 18,
    Is24x7: false, IsDefault: false, ...extra,
  });

  // ── Autorización: todo el controlador es de administración ────────────────

  test('01 · listar horarios sin sesión se rechaza', async () => {
    expect((await anon.get('/api/business-schedules')).status()).toBe(401);
  });

  test('02 · crear un horario sin sesión se rechaza', async () => {
    expect((await anon.post('/api/business-schedules', { data: nuevo() })).status()).toBe(401);
  });

  test('03 · modificar un horario sin sesión se rechaza', async () => {
    const r = await anon.put(`/api/business-schedules/${INEXISTENTE}`, { data: nuevo() });
    expect(r.status()).toBe(401);
  });

  test('04 · añadir un feriado sin sesión se rechaza', async () => {
    const r = await anon.post(`/api/business-schedules/${INEXISTENTE}/holidays`, {
      data: { Date: '2026-12-25', Name: 'Navidad' },
    });
    expect(r.status()).toBe(401);
  });

  test('05 · borrar un feriado sin sesión se rechaza', async () => {
    const r = await anon.delete(`/api/business-schedules/${INEXISTENTE}/holidays/${INEXISTENTE}`);
    expect(r.status()).toBe(401);
  });

  test('06 · un Técnico NO puede listar horarios', async () => {
    const r = await tecnico.get('/api/business-schedules');
    expect([401, 403]).toContain(r.status());
  });

  test('07 · un Técnico NO puede crear horarios', async () => {
    // Cambiar la jornada mueve los vencimientos de SLA de todos los tickets.
    const r = await tecnico.post('/api/business-schedules', { data: nuevo() });
    expect([401, 403]).toContain(r.status());
  });

  test('08 · un Técnico NO puede modificar horarios', async () => {
    const r = await tecnico.put(`/api/business-schedules/${INEXISTENTE}`, { data: nuevo() });
    expect([401, 403]).toContain(r.status());
  });

  test('09 · un Técnico NO puede añadir feriados', async () => {
    // Un feriado extra alarga los plazos: no es decisión de quien atiende.
    const r = await tecnico.post(`/api/business-schedules/${INEXISTENTE}/holidays`, {
      data: { Date: '2026-12-25', Name: 'Navidad' },
    });
    expect([401, 403]).toContain(r.status());
  });

  test('10 · un Técnico NO puede borrar feriados', async () => {
    const r = await tecnico.delete(`/api/business-schedules/${INEXISTENTE}/holidays/${INEXISTENTE}`);
    expect([401, 403]).toContain(r.status());
  });

  // ── Lectura ───────────────────────────────────────────────────────────────

  test('11 · el listado responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/business-schedules'));
    expect(s.success).toBe(true);
  });

  test('12 · el listado devuelve una colección', async () => {
    const s = await sobre(await admin.get('/api/business-schedules'));
    const items = s.data?.Items ?? s.data;
    expect(Array.isArray(items)).toBe(true);
  });

  test('13 · el horario creado aparece en el listado', async () => {
    test.skip(!horarioId, 'no se pudo crear el horario base');
    const s = await sobre(await admin.get('/api/business-schedules'));
    const items = s.data?.Items ?? s.data ?? [];
    expect(items.some((h: any) => h.Id === horarioId)).toBe(true);
  });

  test('14 · consultar un horario por su id lo devuelve', async () => {
    test.skip(!horarioId, 'no se pudo crear el horario base');
    const s = await sobre(await admin.get(`/api/business-schedules/${horarioId}`));
    expect(s.data.Id).toBe(horarioId);
  });

  test('15 · un horario inexistente da 404, no 500', async () => {
    expect((await admin.get(`/api/business-schedules/${INEXISTENTE}`)).status()).toBe(404);
  });

  test('16 · un id que no es GUID no llega al handler', async () => {
    const r = await admin.get('/api/business-schedules/no-soy-guid');
    expect([400, 404]).toContain(r.status());
  });

  test('17 · el horario devuelve su jornada y su máscara de días', async () => {
    test.skip(!horarioId, 'no se pudo crear el horario base');
    const s = await sobre(await admin.get(`/api/business-schedules/${horarioId}`));
    expect(s.data.StartHour).toBe(8);
    expect(s.data.EndHour).toBe(18);
    expect(s.data.WorkingDaysMask).toBe(LUN_A_VIE);
  });

  // ── Validación de la jornada ──────────────────────────────────────────────

  test('18 · un horario sin nombre se rechaza, y POR ESE motivo', async () => {
    // El mensaje se comprueba a propósito. La primera versión solo exigía un
    // 400 y pasaba por casualidad: el nombre vacío chocaba con otro horario
    // vacío anterior y el rechazo llegaba con «Ya existe un horario con ese
    // nombre». Sin nada previo con que chocar, el horario se creaba.
    const r = await admin.post('/api/business-schedules', { data: nuevo({ Name: '' }) });
    expect(r.status()).toBe(400);
    expect(((await sobre(r)).message ?? '').toLowerCase()).toContain('obligatorio');
  });

  test('19 · una hora de inicio posterior a la de fin se rechaza', async () => {
    // Una jornada de 18:00 a 08:00 no es una jornada: dejaría el cálculo de SLA
    // con una duración negativa.
    const r = await admin.post('/api/business-schedules', {
      data: nuevo({ StartHour: 18, EndHour: 8 }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('20 · una hora de inicio igual a la de fin se rechaza', async () => {
    const r = await admin.post('/api/business-schedules', {
      data: nuevo({ StartHour: 9, EndHour: 9 }),
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('21 · una hora fuera del rango 0–23 se rechaza', async () => {
    const r = await admin.post('/api/business-schedules', { data: nuevo({ EndHour: 25 }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('22 · una hora negativa se rechaza', async () => {
    const r = await admin.post('/api/business-schedules', { data: nuevo({ StartHour: -1 }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('23 · una máscara de días vacía se rechaza', async () => {
    // Sin un solo día laborable, ningún ticket vencería nunca.
    const r = await admin.post('/api/business-schedules', { data: nuevo({ WorkingDaysMask: 0 }) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('24 · un cuerpo vacío se rechaza sin romper el servidor', async () => {
    const r = await admin.post('/api/business-schedules', { data: {} });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('25 · modificar el horario cambia lo que se lee después', async () => {
    test.skip(!horarioId, 'no se pudo crear el horario base');
    await admin.put(`/api/business-schedules/${horarioId}`, {
      data: nuevo({ Name: zz('HorarioEditado'), StartHour: 7, EndHour: 20 }),
    });
    const s = await sobre(await admin.get(`/api/business-schedules/${horarioId}`));
    expect(s.data.StartHour).toBe(7);
    expect(s.data.EndHour).toBe(20);
  });

  // ── Feriados ──────────────────────────────────────────────────────────────

  test('26 · añadir un feriado válido funciona', async () => {
    test.skip(!horarioId, 'no se pudo crear el horario base');
    const r = await admin.post(`/api/business-schedules/${horarioId}/holidays`, {
      data: { Date: '2026-12-25', Name: 'ZZ Navidad' },
    });
    expect(r.status()).toBeLessThan(300);
  });

  test('27 · el feriado aparece luego en el horario', async () => {
    // Contraprueba del anterior: aceptar la petición no es haberlo guardado.
    test.skip(!horarioId, 'no se pudo crear el horario base');
    await admin.post(`/api/business-schedules/${horarioId}/holidays`, {
      data: { Date: '2026-08-06', Name: 'ZZ Independencia' },
    });
    const s = await sobre(await admin.get(`/api/business-schedules/${horarioId}`));
    const crudo = JSON.stringify(s.data);
    expect(crudo).toContain('ZZ Independencia');
  });

  test('28 · un feriado con fecha inválida se rechaza', async () => {
    test.skip(!horarioId, 'no se pudo crear el horario base');
    const r = await admin.post(`/api/business-schedules/${horarioId}/holidays`, {
      data: { Date: '2026-13-45', Name: 'ZZ Imposible' },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('29 · un feriado sin nombre se rechaza', async () => {
    // Se aceptaba con 200. Un día no laborable en blanco alarga los plazos de
    // SLA y nadie puede decir por qué está ahí ni si sobra.
    test.skip(!horarioId, 'no se pudo crear el horario base');
    const r = await admin.post(`/api/business-schedules/${horarioId}/holidays`, {
      data: { Date: '2026-11-02', Name: '   ' },
    });
    expect(r.status()).toBe(400);
    expect(((await sobre(r)).message ?? '').toLowerCase()).toContain('obligatorio');
  });

  test('30 · borrar un feriado inexistente no rompe el servidor', async () => {
    test.skip(!horarioId, 'no se pudo crear el horario base');
    const r = await admin.delete(`/api/business-schedules/${horarioId}/holidays/${INEXISTENTE}`);
    expect(r.status()).toBeLessThan(500);
  });
});
