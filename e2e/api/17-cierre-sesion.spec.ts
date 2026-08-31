import { test, expect, APIRequestContext } from '@playwright/test';
import { comoTecnico, sinSesion, estado, sobre } from './arnes';

/**
 * Cierre de sesión — va el ÚLTIMO, y por una razón concreta.
 *
 * `POST /api/auth/logout` mete el token en la lista negra. Los dieciséis módulos
 * anteriores comparten dos tokens —el del administrador y el del técnico—, así
 * que probar el camino feliz de logout en cualquier otro sitio deja sin sesión a
 * todo lo que venga después.
 *
 * Ocurrió: una versión anterior lo probaba dentro del módulo de autenticación
 * usando un contexto HTTP distinto, creyendo que eso lo aislaba. No lo aísla —lo
 * que se invalida es el token, no la conexión— y dejó 64 pruebas en 401.
 *
 * Se usa el token del **técnico**: llegados aquí ya no lo necesita nadie, y el
 * del administrador se conserva intacto para que la preparación pueda
 * reutilizarlo en la siguiente ejecución sin gastar un inicio de sesión.
 */
test.describe('Cierre de sesión', () => {
  let tecnico: APIRequestContext, anon: APIRequestContext;

  test.beforeAll(async () => {
    tecnico = await comoTecnico(); anon = await sinSesion();
  });
  test.afterAll(async () => {
    await Promise.all([tecnico.dispose(), anon.dispose()]);
  });

  test('01 · el token del técnico funciona ANTES de cerrar sesión', async () => {
    // Contraprueba imprescindible: sin ella, un token ya inválido haría pasar
    // la prueba siguiente sin que el logout hubiera hecho nada.
    expect((await tecnico.get('/api/profile')).status()).toBe(200);
  });

  test('02 · cerrar sesión responde correctamente', async () => {
    const r = await tecnico.post('/api/auth/logout', { data: {} });
    expect(r.status()).toBeLessThan(400);
  });

  test('03 · el token YA NO sirve después de cerrar sesión', async () => {
    // Lo que de verdad importa: que cerrar sesión invalide de verdad. Si el
    // token siguiera valiendo, cerrar sesión en un ordenador compartido no
    // protegería nada.
    const r = await tecnico.get('/api/profile');
    expect(r.status()).toBe(401);
    expect(((await sobre(r)).message ?? '').toLowerCase()).toContain('sesión');
  });

  test('04 · el token del ADMINISTRADOR sigue siendo válido', async () => {
    // Cerrar una sesión no puede cerrar las de los demás.
    const ctx = await sinSesion();
    const r = await ctx.get('/api/profile', {
      headers: { Authorization: `Bearer ${estado().tokenAdmin}` },
    });
    await ctx.dispose();
    expect(r.status()).toBe(200);
  });
});
