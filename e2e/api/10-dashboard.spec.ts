import { test, expect, APIRequestContext } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, estado, sobre } from './arnes';

/**
 * Módulo Dashboard — 30 casos.
 *
 * 22 endpoints de solo lectura, todos `AllRoles`. Es el módulo con más
 * superficie y menos reglas, así que el criterio ha sido distinto: aquí no hay
 * validación que probar, hay **disponibilidad**. Un panel que devuelve 500 en
 * una tarjeta deja la pantalla a medias sin decir por qué, y es exactamente el
 * tipo de fallo que nadie reporta porque «el sistema va bien».
 *
 * Esta forma de probar acaba de demostrar su utilidad: el mismo patrón encontró
 * que /api/payments/collection-report llevaba roto desde siempre.
 */
test.describe('Dashboard', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let adminId: string;
  const anio = new Date().getFullYear();

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    adminId = estado().adminId;
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  /** Los 20 paneles de lectura. Cada uno es un caso. */
  const PANELES = [
    'kpis', 'tendencia-cobros', 'metodos-pago', 'tickets-estado', 'tickets-urgentes',
    'tickets-por-tipo', 'resolucion-promedio', 'whatsapp-actividad', 'deudores',
    'comprobantes-recientes', 'clientes-por-zona', 'actividad-horas', 'pagos',
    'tickets-metricas', 'notif-stats', 'chatbot-kpis', 'auto-actions',
    'aging-cartera', 'proximos-corte', 'workload-tecnicos',
  ];

  // ── 01–20 · Cada panel responde, y ninguno con 500 ────────────────────────
  PANELES.forEach((panel, i) => {
    test(`${String(i + 1).padStart(2, '0')} · el panel «${panel}» responde sin error de servidor`, async () => {
      const r = await admin.get(`/api/dashboard/${panel}`);
      expect(r.status(), `GET /api/dashboard/${panel} devolvió ${r.status()}`).toBe(200);
    });
  });

  // ── Autorización ──────────────────────────────────────────────────────────

  test('21 · los KPI sin sesión se rechazan', async () => {
    expect((await anon.get('/api/dashboard/kpis')).status()).toBe(401);
  });

  test('22 · la tendencia de cobros sin sesión se rechaza', async () => {
    expect((await anon.get('/api/dashboard/tendencia-cobros')).status()).toBe(401);
  });

  test('23 · los deudores sin sesión se rechazan', async () => {
    expect((await anon.get('/api/dashboard/deudores')).status()).toBe(401);
  });

  test('24 · un Técnico SÍ puede ver los KPI', async () => {
    // El panel es `AllRoles` a propósito: el técnico necesita su carga de trabajo.
    expect((await tecnico.get('/api/dashboard/kpis')).status()).toBe(200);
  });

  test('25 · un Técnico SÍ puede ver su carga de trabajo', async () => {
    expect((await tecnico.get('/api/dashboard/workload-tecnicos')).status()).toBe(200);
  });

  // ── Forma de las respuestas ───────────────────────────────────────────────

  test('26 · los KPI responden con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/dashboard/kpis'));
    expect(s.success).toBe(true);
    expect(s.data).toBeTruthy();
  });

  test('27 · la tendencia de cobros devuelve una serie', async () => {
    // El fallo P-01 estaba aquí: se hacía una consulta por mes. Ahora es una
    // sola agrupada, y lo que no puede cambiar es que siga devolviendo la serie.
    const s = await sobre(await admin.get('/api/dashboard/tendencia-cobros'));
    expect(Array.isArray(s.data?.Meses), 'la serie viene en data.Meses').toBe(true);
    // Y cada mes trae su total: la agrupación de P-01 no puede perder columnas.
    for (const m of s.data.Meses) {
      expect(typeof m.Total).toBe('number');
      expect(typeof m.Cantidad).toBe('number');
    }
  });

  test('28 · las preferencias del panel se pueden leer', async () => {
    const r = await admin.get(`/api/dashboard/preferences/${adminId}`);
    expect(r.status()).toBeLessThan(500);
  });

  test('29 · un año fuera de rango no rompe ningún panel', async () => {
    const r = await admin.get(`/api/dashboard/tendencia-cobros?year=1800`);
    expect(r.status()).toBeLessThan(500);
  });

  test('30 · un parámetro basura no rompe ningún panel', async () => {
    // Los paneles reciben lo que ponga el navegador en la URL.
    const r = await admin.get(`/api/dashboard/kpis?year=abc&month=xyz&foo=bar`);
    expect(r.status()).toBeLessThan(500);
  });

  test('31 · guardar preferencias del panel sin sesión se rechaza', async () => {
    const r = await anon.put(`/api/dashboard/preferences/${adminId}`, { data: {} });
    expect(r.status()).toBe(401);
  });

  test('32 · guardar y volver a leer las preferencias funciona', async () => {
    // Las preferencias son banderas por sección (`ShowKpis`, `ShowTendencia`…),
    // no una lista de paneles ocultos.
    const previas = (await sobre(await admin.get(`/api/dashboard/preferences/${adminId}`))).data;

    const r = await admin.put(`/api/dashboard/preferences/${adminId}`, {
      data: { ...previas, ShowZonas: false },
    });
    expect(r.status()).toBeLessThan(400);

    const s = await sobre(await admin.get(`/api/dashboard/preferences/${adminId}`));
    expect(s.data.ShowZonas).toBe(false);

    await admin.put(`/api/dashboard/preferences/${adminId}`, { data: previas });
  });

  test('33 · ocultar TODAS las secciones se rechaza', async () => {
    // Regla propia del módulo: un panel completamente vacío no es una
    // preferencia, es una pantalla rota que el usuario no sabría deshacer.
    const previas = (await sobre(await admin.get(`/api/dashboard/preferences/${adminId}`))).data;
    const todasOcultas = Object.fromEntries(Object.keys(previas).map(k => [k, false]));

    const r = await admin.put(`/api/dashboard/preferences/${adminId}`, { data: todasOcultas });
    expect(r.status()).toBe(400);
    expect(((await sobre(r)).message ?? '').toLowerCase()).toContain('al menos una');
  });
});
