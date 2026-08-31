import { test, expect, APIRequestContext } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, sobre, zz } from './arnes';

/**
 * Módulo Cobertura — 30 casos.
 *
 * Zonas (polígonos PostGIS), cajas NAP y sus puertos. Es el módulo donde una
 * respuesta equivocada se convierte en una promesa comercial que no se puede
 * cumplir: si `check` dice que hay cobertura donde no la hay, se agenda una
 * instalación imposible.
 */
test.describe('Cobertura', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  const INEXISTENTE = '00000000-0000-0000-0000-000000000000';
  // Santa Cruz de la Sierra, y un punto deliberadamente remoto en el Chaco.
  const DENTRO = { lat: -17.7833, lng: -63.1821 };
  const REMOTO = { lat: -20.5, lng: -60.5 };

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  // ── Autorización ──────────────────────────────────────────────────────────

  test('01 · consultar cobertura sin sesión se rechaza', async () => {
    const r = await anon.get(`/api/coverage/check?lat=${DENTRO.lat}&lng=${DENTRO.lng}`);
    expect(r.status()).toBe(401);
  });

  test('02 · listar zonas sin sesión se rechaza', async () => {
    expect((await anon.get('/api/coverage/zones')).status()).toBe(401);
  });

  test('03 · crear una zona sin sesión se rechaza', async () => {
    expect((await anon.post('/api/coverage/zones', { data: {} })).status()).toBe(401);
  });

  test('04 · un Técnico SÍ puede ver las zonas', async () => {
    expect((await tecnico.get('/api/coverage/zones')).status()).toBe(200);
  });

  test('05 · un Técnico SÍ puede ver las cajas', async () => {
    expect((await tecnico.get('/api/coverage/boxes')).status()).toBe(200);
  });

  test('06 · un Técnico NO puede crear zonas', async () => {
    const r = await tecnico.post('/api/coverage/zones', { data: { Nombre: zz('Zona') } });
    expect([401, 403]).toContain(r.status());
  });

  test('07 · un Técnico NO puede borrar zonas', async () => {
    const r = await tecnico.delete(`/api/coverage/zones/${INEXISTENTE}`);
    expect([401, 403]).toContain(r.status());
  });

  test('08 · un Técnico NO puede crear cajas', async () => {
    const r = await tecnico.post('/api/coverage/boxes', { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('09 · un Técnico NO puede marcar un puerto como dañado', async () => {
    // Cambia la capacidad vendible: es decisión de administración.
    const r = await tecnico.post(`/api/coverage/boxes/${INEXISTENTE}/ports/1/damage`, { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('10 · un Técnico NO puede ver el histórico de consultas', async () => {
    const r = await tecnico.get('/api/coverage/queries');
    expect([401, 403]).toContain(r.status());
  });

  // ── Consulta de cobertura ─────────────────────────────────────────────────

  test('11 · consultar un punto responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get(`/api/coverage/check?lat=${DENTRO.lat}&lng=${DENTRO.lng}`));
    expect(s.success).toBe(true);
  });

  test('12 · la respuesta trae un veredicto', async () => {
    const s = await sobre(await admin.get(`/api/coverage/check?lat=${DENTRO.lat}&lng=${DENTRO.lng}`));
    expect(s.data).toBeTruthy();
  });

  test('13 · un punto remoto responde sin romperse', async () => {
    const r = await admin.get(`/api/coverage/check?lat=${REMOTO.lat}&lng=${REMOTO.lng}`);
    expect(r.status()).toBe(200);
  });

  test('14 · un punto remoto NO se declara con cobertura', async () => {
    // El caso que importa comercialmente: prometer donde no se puede dar.
    const s = await sobre(await admin.get(`/api/coverage/check?lat=${REMOTO.lat}&lng=${REMOTO.lng}`));
    const texto = JSON.stringify(s.data);
    expect(texto).not.toMatch(/"(Outcome|Resultado)"\s*:\s*"(Cubierto|ConCobertura)"/i);
  });

  test('15 · una latitud fuera de rango se rechaza', async () => {
    const r = await admin.get('/api/coverage/check?lat=999&lng=-63.18');
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('16 · una longitud fuera de rango se rechaza', async () => {
    const r = await admin.get('/api/coverage/check?lat=-17.78&lng=999');
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('17 · coordenadas no numéricas no rompen el servidor', async () => {
    const r = await admin.get('/api/coverage/check?lat=abc&lng=def');
    expect(r.status()).toBeLessThan(500);
  });

  test('18 · faltar una coordenada no rompe el servidor', async () => {
    const r = await admin.get('/api/coverage/check?lat=-17.78');
    expect(r.status()).toBeLessThan(500);
  });

  test('19 · el punto (0,0) no se declara con cobertura', async () => {
    // Es el valor por defecto cuando el GPS falla: si diera "cubierto",
    // cualquier error de captura se convertiría en una promesa comercial.
    const s = await sobre(await admin.get('/api/coverage/check?lat=0&lng=0'));
    const texto = JSON.stringify(s.data ?? {});
    expect(texto).not.toMatch(/"(Outcome|Resultado)"\s*:\s*"(Cubierto|ConCobertura)"/i);
  });

  // ── Zonas ─────────────────────────────────────────────────────────────────

  test('20 · el listado de zonas responde una colección', async () => {
    const s = await sobre(await admin.get('/api/coverage/zones'));
    const items = s.data?.Items ?? s.data;
    expect(Array.isArray(items)).toBe(true);
  });

  test('21 · una zona sin nombre se rechaza', async () => {
    const r = await admin.post('/api/coverage/zones', { data: { Nombre: '' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('22 · una zona sin polígono se rechaza', async () => {
    // Una zona sin geometría no puede contener puntos: no sirve para nada.
    const r = await admin.post('/api/coverage/zones', { data: { Nombre: zz('Zona') } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('23 · un polígono con menos de 3 puntos se rechaza', async () => {
    const r = await admin.post('/api/coverage/zones', {
      data: { Nombre: zz('Zona'), Poligono: [{ lat: -17.7, lng: -63.1 }, { lat: -17.8, lng: -63.2 }] },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('24 · borrar una zona inexistente no rompe el servidor', async () => {
    const r = await admin.delete(`/api/coverage/zones/${INEXISTENTE}`);
    expect(r.status()).toBeLessThan(500);
  });

  test('25 · las cajas de una zona inexistente no rompen el servidor', async () => {
    const r = await admin.get(`/api/coverage/zones/${INEXISTENTE}/boxes`);
    expect(r.status()).toBeLessThan(500);
  });

  // ── Cajas y puertos ───────────────────────────────────────────────────────

  test('26 · el listado de cajas responde una colección', async () => {
    const s = await sobre(await admin.get('/api/coverage/boxes'));
    const items = s.data?.Items ?? s.data;
    expect(Array.isArray(items)).toBe(true);
  });

  test('27 · una caja sin nombre se rechaza', async () => {
    const r = await admin.post('/api/coverage/boxes', { data: {} });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('28 · los puertos de una caja inexistente no rompen el servidor', async () => {
    const r = await admin.get(`/api/coverage/boxes/${INEXISTENTE}/ports`);
    expect(r.status()).toBeLessThan(500);
  });

  test('29 · dañar un puerto de una caja inexistente no rompe el servidor', async () => {
    const r = await admin.post(`/api/coverage/boxes/${INEXISTENTE}/ports/1/damage`, { data: {} });
    expect(r.status()).toBeLessThan(500);
  });

  test('30 · un número de puerto negativo no rompe el servidor', async () => {
    const r = await admin.post(`/api/coverage/boxes/${INEXISTENTE}/ports/-5/repair`, { data: {} });
    expect(r.status()).toBeLessThan(500);
  });

  // ── Superficie que la medición de cobertura señaló sin tocar ──────────────

  test('31 · las ubicaciones de clientes responden', async () => {
    expect((await admin.get('/api/coverage/client-locations')).status()).toBe(200);
  });

  test('32 · un Técnico SÍ puede ver las ubicaciones de clientes', async () => {
    // Las necesita para llegar a la casa: es dato de campo.
    expect((await tecnico.get('/api/coverage/client-locations')).status()).toBe(200);
  });

  test('33 · modificar una zona inexistente no rompe el servidor', async () => {
    const r = await admin.put(`/api/coverage/zones/${INEXISTENTE}`, { data: { Nombre: zz('Zona') } });
    expect(r.status()).toBeLessThan(500);
  });

  test('34 · modificar una caja inexistente no rompe el servidor', async () => {
    const r = await admin.put(`/api/coverage/boxes/${INEXISTENTE}`, { data: { Nombre: zz('Caja') } });
    expect(r.status()).toBeLessThan(500);
  });

  test('35 · borrar una caja inexistente no rompe el servidor', async () => {
    const r = await admin.delete(`/api/coverage/boxes/${INEXISTENTE}`);
    expect(r.status()).toBeLessThan(500);
  });

  test('36 · un Técnico NO puede modificar cajas', async () => {
    const r = await tecnico.put(`/api/coverage/boxes/${INEXISTENTE}`, { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('37 · la consulta de cobertura por dirección responde', async () => {
    const r = await admin.get('/api/coverage/check-address?address=Santa%20Cruz');
    expect(r.status()).toBeLessThan(500);
  });

  test('38 · una dirección vacía no rompe el servidor', async () => {
    const r = await admin.get('/api/coverage/check-address?address=');
    expect(r.status()).toBeLessThan(500);
  });
});
