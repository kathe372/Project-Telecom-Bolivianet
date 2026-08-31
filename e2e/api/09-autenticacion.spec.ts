import { test, expect, APIRequestContext, request as apiRequest } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, estado, sobre, BASE } from './arnes';

/**
 * Módulo Autenticación y perfil — 30 casos.
 *
 * ── Una restricción que condiciona TODO este módulo ─────────────────────────
 * Los endpoints de autenticación admiten 10 peticiones cada 5 minutos por IP, y
 * `/auth/refresh` cuenta dentro del mismo presupuesto. Un módulo de 30 casos que
 * intentara iniciar sesión de verdad se estrangularía a sí mismo.
 *
 * Por eso casi todos los casos comprueban el comportamiento SIN consumir
 * intentos: tokens manipulados, ausentes, mal formados, con esquema incorrecto.
 * Es también lo que más importa: son las formas en que alguien intentaría
 * entrar sin credenciales.
 *
 * Y NINGÚN caso prueba contraseñas equivocadas contra cuentas reales: tres
 * fallos bloquean la cuenta, y un administrador bloqueado impide arrancar el
 * backend. La suite no debe poder tumbar un despliegue.
 */
test.describe('Autenticación y perfil', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let tokenAdmin: string;

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    tokenAdmin = estado().tokenAdmin;
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  /**
   * Petición con una cabecera Authorization arbitraria.
   *
   * Reutiliza el contexto anónimo en vez de crear uno por llamada: veinte
   * contextos nuevos en un módulo abren veinte grupos de conexiones, y eso
   * producía paradas esporádicas de 30 s que parecían del servidor y no lo eran
   * (el endpoint medido a mano responde en 15 ms).
   */
  async function con(auth: string | null, ruta = '/api/profile') {
    const r = await anon.get(ruta, auth === null ? {} : { headers: { Authorization: auth } });
    return r.status();
  }

  // ── Sin credencial ────────────────────────────────────────────────────────

  test('01 · el perfil sin sesión se rechaza', async () => {
    expect(await con(null)).toBe(401);
  });

  test('02 · /auth/me sin sesión se rechaza', async () => {
    expect(await con(null, '/api/auth/me')).toBe(401);
  });

  test('03 · el perfil de administrador sin sesión se rechaza', async () => {
    expect(await con(null, '/api/profile/admin-only')).toBe(401);
  });

  test('04 · los permisos sin sesión se rechazan', async () => {
    expect(await con(null, '/api/profile/permissions')).toBe(401);
  });

  // ── Tokens mal formados: ninguno debe pasar, ninguno debe romper ──────────

  test('05 · una cabecera Authorization vacía se rechaza', async () => {
    expect(await con('')).toBe(401);
  });

  test('06 · "Bearer" sin token se rechaza', async () => {
    expect(await con('Bearer')).toBe(401);
  });

  test('07 · "Bearer " con token vacío se rechaza', async () => {
    expect(await con('Bearer ')).toBe(401);
  });

  test('08 · un token que no es JWT se rechaza', async () => {
    expect(await con('Bearer esto-no-es-un-jwt')).toBe(401);
  });

  test('09 · un JWT con la firma alterada se rechaza', async () => {
    // El caso central: el contenido es válido, solo cambia la firma.
    expect(await con(`Bearer ${tokenAdmin.slice(0, -3)}AAA`)).toBe(401);
  });

  test('10 · un JWT truncado se rechaza', async () => {
    expect(await con(`Bearer ${tokenAdmin.slice(0, 40)}`)).toBe(401);
  });

  test('11 · un JWT sin firma (alg=none) se rechaza', async () => {
    // Es el ataque clásico contra implementaciones ingenuas de JWT.
    const cab = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const carga = tokenAdmin.split('.')[1];
    expect(await con(`Bearer ${cab}.${carga}.`)).toBe(401);
  });

  test('12 · el esquema Basic no sirve para autenticarse', async () => {
    const cred = Buffer.from('admin:admin').toString('base64');
    expect(await con(`Basic ${cred}`)).toBe(401);
  });

  test('13 · el token sin el prefijo Bearer se rechaza', async () => {
    expect(await con(tokenAdmin)).toBe(401);
  });

  test('14 · un token con basura antepuesta se rechaza', async () => {
    expect(await con(`Bearer basura${tokenAdmin}`)).toBe(401);
  });

  test('15 · escalar el rol dentro del JWT no funciona', async () => {
    // La escalada de privilegios de manual: se coge el token del TÉCNICO, se le
    // cambia el rol a Admin y se ataca un endpoint de administración. Sin la
    // clave del servidor la firma no cuadra, así que debe rechazarse.
    //
    // La primera versión de esta prueba manipulaba el token del ADMIN y le ponía
    // el rol que ya tenía: la firma seguía siendo válida y el 200 era correcto.
    // No probaba nada. El token tiene que ser el de menor privilegio.
    const [cab, carga, firma] = estado().tokenTecnico.split('.');
    const json = JSON.parse(Buffer.from(carga, 'base64url').toString());
    json['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] = 'Admin';
    const nueva = Buffer.from(JSON.stringify(json)).toString('base64url');
    expect(await con(`Bearer ${cab}.${nueva}.${firma}`, '/api/profile/admin-only')).toBe(401);
  });

  test('15b · el token del técnico SIN manipular tampoco entra en administración', async () => {
    // Contraprueba: descarta que el 401 anterior venga de que el endpoint
    // rechace a todo el mundo. Aquí el token es válido y el rechazo es 403.
    const r = await tecnico.get('/api/profile/admin-only');
    expect([401, 403]).toContain(r.status());
  });

  // ── Con credencial válida ─────────────────────────────────────────────────

  test('16 · el perfil responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/profile'));
    expect(s.success).toBe(true);
  });

  test('17 · /auth/me devuelve la identidad', async () => {
    const s = await sobre(await admin.get('/api/auth/me'));
    expect(s.data).toBeTruthy();
  });

  test('18 · el perfil NO devuelve el hash de la contraseña', async () => {
    const crudo = (await sobre(await admin.get('/api/profile'))).crudo;
    expect(crudo.toLowerCase()).not.toContain('passwordhash');
    expect(crudo).not.toMatch(/\$2[aby]\$\d{2}\$/);
  });

  test('19 · el perfil NO devuelve el token de refresco', async () => {
    // Si viajara en el cuerpo, JavaScript podría leerlo y la cookie httpOnly
    // dejaría de servir para nada.
    const crudo = (await sobre(await admin.get('/api/profile'))).crudo;
    expect(crudo.toLowerCase()).not.toContain('refreshtoken');
  });

  test('20 · un Técnico SÍ accede a su perfil', async () => {
    expect((await tecnico.get('/api/profile')).status()).toBe(200);
  });

  test('21 · un Técnico SÍ ve sus permisos', async () => {
    expect((await tecnico.get('/api/profile/permissions')).status()).toBe(200);
  });

  test('22 · un Técnico NO entra en el área de administración', async () => {
    const r = await tecnico.get('/api/profile/admin-only');
    expect([401, 403]).toContain(r.status());
  });

  test('23 · el administrador SÍ entra en el área de administración', async () => {
    // Contraprueba del anterior: sin esto, un 403 universal pasaría por bueno.
    expect((await admin.get('/api/profile/admin-only')).status()).toBe(200);
  });

  // ── Contrato del login, sin gastar intentos contra cuentas reales ─────────

  test('24 · el login rechaza un cuerpo vacío', async () => {
    const r = await anon.post('/api/auth/login', { data: {} });
    expect([400, 401, 429]).toContain(r.status());
  });

  test('25 · el login rechaza un correo con formato inválido', async () => {
    const r = await anon.post('/api/auth/login', {
      data: { Email: 'no-es-correo', Password: 'LoQueSea1!' },
    });
    expect([400, 401, 429]).toContain(r.status());
  });

  test('26 · el login rechaza una contraseña vacía', async () => {
    const r = await anon.post('/api/auth/login', {
      data: { Email: 'zz-inexistente@test.bo', Password: '' },
    });
    expect([400, 401, 429]).toContain(r.status());
  });

  test('27 · el login de una cuenta inexistente no revela que no existe', async () => {
    // Distinguir "no existe" de "contraseña incorrecta" permite enumerar
    // usuarios. Se usa una cuenta inventada, así que no bloquea a nadie.
    const r = await anon.post('/api/auth/login', {
      data: { Email: `zz-nadie-${Date.now()}@test.bo`, Password: 'LoQueSea1!' },
    });
    if (r.status() === 429) test.skip(true, 'limitador de tasa activo');
    const s = await sobre(r);
    expect((s.message ?? '').toLowerCase()).not.toMatch(/no existe|not found|no encontrado/);
  });

  test('28 · refrescar sin cookie se rechaza', async () => {
    const r = await anon.post('/api/auth/refresh');
    expect([401, 429]).toContain(r.status());
  });

  test('29 · refrescar con un token de refresco inventado se rechaza', async () => {
    const r = await anon.post('/api/auth/refresh/mobile', {
      data: { RefreshToken: 'token-inventado-que-no-existe' },
    });
    expect([400, 401, 429]).toContain(r.status());
  });

  test('30 · cambiar la contraseña sin sesión se rechaza', async () => {
    const r = await anon.put('/api/auth/change-password', {
      data: { CurrentPassword: 'x', NewPassword: 'Y1!aaaaaa' },
    });
    expect([401, 429]).toContain(r.status());
  });

  // El camino feliz de `logout` NO se prueba aquí: cerrar sesión mete el token
  // en la lista negra, y este módulo comparte el token con los otros quince.
  // La primera versión lo intentaba desde un contexto HTTP distinto creyendo que
  // eso bastaba — no basta: lo que se invalida es el token, no la conexión, y
  // dejó 64 pruebas en 401. Vive en `17-cierre-sesion.spec.ts`, que corre al
  // final y usa el token del técnico.
  test('31 · cerrar sesión sin sesión no rompe el servidor', async () => {
    const r = await anon.post('/api/auth/logout', { data: {} });
    expect(r.status()).toBeLessThan(500);
  });

});
