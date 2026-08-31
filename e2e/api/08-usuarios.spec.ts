import { test, expect, APIRequestContext } from '@playwright/test';
import { comoAdmin, comoTecnico, sinSesion, estado, sobre, zzNombre } from './arnes';
import { USUARIOS } from '../apoyo';

/**
 * Módulo Usuarios y auditoría — 30 casos.
 *
 * Todo el controlador es `AdminOnly`, así que la mitad de los casos comprueban
 * justamente eso: que no haya ni una rendija. Es el módulo que reparte poder
 * dentro del sistema, y el que registra quién hizo qué.
 *
 * Cuidado deliberado: NINGÚN caso intenta iniciar sesión con contraseña
 * equivocada contra una cuenta real. Tres fallos bloquean la cuenta, y un
 * administrador bloqueado impide arrancar el backend si falta
 * ADMIN_RESET_PASSWORD. Una suite de pruebas no debe poder tumbar un despliegue.
 */
test.describe('Usuarios y auditoría', () => {
  let admin: APIRequestContext, tecnico: APIRequestContext, anon: APIRequestContext;
  let adminId: string, tecnicoId: string;
  const INEXISTENTE = '00000000-0000-0000-0000-000000000000';

  test.beforeAll(async () => {
    admin = await comoAdmin(); tecnico = await comoTecnico(); anon = await sinSesion();
    const e = estado(); adminId = e.adminId; tecnicoId = e.tecnicoId;
  });
  test.afterAll(async () => {
    await Promise.all([admin.dispose(), tecnico.dispose(), anon.dispose()]);
  });

  const nuevoUsuario = (extra: Record<string, unknown> = {}) => ({
    FullName: zzNombre('Usuario'),
    Email: `zz-qa-${Math.random().toString(36).slice(2, 10)}@test.bo`,
    Role: 'Tecnico', ...extra,
  });

  // ── Nadie sin sesión ──────────────────────────────────────────────────────

  test('01 · listar usuarios sin sesión se rechaza', async () => {
    expect((await anon.get('/api/users')).status()).toBe(401);
  });

  test('02 · ver un usuario sin sesión se rechaza', async () => {
    expect((await anon.get(`/api/users/${adminId}`)).status()).toBe(401);
  });

  test('03 · crear un usuario sin sesión se rechaza', async () => {
    expect((await anon.post('/api/users', { data: nuevoUsuario() })).status()).toBe(401);
  });

  test('04 · desactivar un usuario sin sesión se rechaza', async () => {
    expect((await anon.put(`/api/users/${tecnicoId}/deactivate`)).status()).toBe(401);
  });

  test('05 · borrar un usuario sin sesión se rechaza', async () => {
    expect((await anon.delete(`/api/users/${tecnicoId}`)).status()).toBe(401);
  });

  test('06 · el registro de auditoría sin sesión se rechaza', async () => {
    expect((await anon.get('/api/audit-logs')).status()).toBe(401);
  });

  // ── Un Técnico no toca nada de esto ───────────────────────────────────────

  test('07 · un Técnico NO puede listar usuarios', async () => {
    const r = await tecnico.get('/api/users');
    expect([401, 403]).toContain(r.status());
  });

  test('08 · un Técnico NO puede crear usuarios', async () => {
    // Si pudiera, podría crearse un administrador y escalar privilegios.
    const r = await tecnico.post('/api/users', { data: nuevoUsuario({ Role: 'Admin' }) });
    expect([401, 403]).toContain(r.status());
  });

  test('09 · un Técnico NO puede editar usuarios', async () => {
    const r = await tecnico.put(`/api/users/${tecnicoId}`, { data: nuevoUsuario() });
    expect([401, 403]).toContain(r.status());
  });

  test('10 · un Técnico NO puede desactivar usuarios', async () => {
    const r = await tecnico.put(`/api/users/${adminId}/deactivate`);
    expect([401, 403]).toContain(r.status());
  });

  test('11 · un Técnico NO puede desbloquear cuentas', async () => {
    const r = await tecnico.put(`/api/users/${adminId}/unlock`);
    expect([401, 403]).toContain(r.status());
  });

  test('12 · un Técnico NO puede forzar el cambio de contraseña de otro', async () => {
    const r = await tecnico.post(`/api/users/${adminId}/force-reset-password`, { data: {} });
    expect([401, 403]).toContain(r.status());
  });

  test('13 · un Técnico NO puede borrar usuarios', async () => {
    const r = await tecnico.delete(`/api/users/${adminId}`);
    expect([401, 403]).toContain(r.status());
  });

  test('14 · un Técnico NO puede leer la auditoría', async () => {
    // Quien puede borrar su propio rastro deja de ser auditable.
    const r = await tecnico.get('/api/audit-logs');
    expect([401, 403]).toContain(r.status());
  });

  test('15 · un Técnico NO puede exportar la auditoría', async () => {
    const r = await tecnico.get('/api/audit-logs/export');
    expect([401, 403]).toContain(r.status());
  });

  test('16 · un Técnico NO puede ver el detalle de un usuario', async () => {
    const r = await tecnico.get(`/api/users/${adminId}/detail`);
    expect([401, 403]).toContain(r.status());
  });

  // ── Lectura como administrador ────────────────────────────────────────────

  test('17 · el listado responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/users'));
    expect(s.success).toBe(true);
  });

  test('18 · el listado viene paginado', async () => {
    const s = await sobre(await admin.get('/api/users?PageNumber=1&PageSize=2'));
    const items = s.data.Items ?? s.data;
    expect(items.length).toBeLessThanOrEqual(2);
  });

  test('19 · el listado NO expone hashes de contraseña', async () => {
    // Aunque sea el administrador quien mira: un hash filtrado es un hash
    // que se puede atacar sin límite de intentos y fuera de todo registro.
    const crudo = (await sobre(await admin.get('/api/users'))).crudo;
    expect(crudo.toLowerCase()).not.toContain('passwordhash');
    expect(crudo).not.toMatch(/\$2[aby]\$\d{2}\$/);   // ningún hash BCrypt
  });

  test('20 · el usuario del chatbot NO aparece en el listado', async () => {
    // Es una cuenta de servicio, no una persona: enseñarla invita a editarla.
    const crudo = (await sobre(await admin.get('/api/users?PageSize=100'))).crudo;
    expect(crudo).not.toContain('bot@telecombolivianet.bo');
  });

  test('21 · consultar un usuario por id lo devuelve', async () => {
    const s = await sobre(await admin.get(`/api/users/${adminId}`));
    expect(s.data.Id).toBe(adminId);
  });

  test('22 · un usuario inexistente da 404, no 500', async () => {
    expect((await admin.get(`/api/users/${INEXISTENTE}`)).status()).toBe(404);
  });

  test('23 · el catálogo de permisos responde', async () => {
    expect((await admin.get('/api/users/permissions')).status()).toBe(200);
  });

  test('24 · el detalle de un usuario responde', async () => {
    expect((await admin.get(`/api/users/${adminId}/detail`)).status()).toBe(200);
  });

  test('25 · la auditoría responde con el sobre del proyecto', async () => {
    const s = await sobre(await admin.get('/api/audit-logs'));
    expect(s.success).toBe(true);
  });

  test('26 · la auditoría viene paginada', async () => {
    const s = await sobre(await admin.get('/api/audit-logs?PageNumber=1&PageSize=5'));
    const items = s.data.Items ?? s.data;
    expect(Array.isArray(items)).toBe(true);
  });

  // ── Validación ────────────────────────────────────────────────────────────

  test('27 · un usuario sin correo se rechaza', async () => {
    const r = await admin.post('/api/users', { data: nuevoUsuario({ Email: '' }) });
    expect(r.status()).toBe(400);
  });

  test('28 · un correo con formato inválido se rechaza', async () => {
    const r = await admin.post('/api/users', { data: nuevoUsuario({ Email: 'no-es-un-correo' }) });
    expect(r.status()).toBe(400);
  });

  test('29 · un rol inventado se rechaza', async () => {
    // Un rol desconocido que se aceptara podría caer fuera de toda política.
    const r = await admin.post('/api/users', { data: nuevoUsuario({ Role: 'SuperUsuario' }) });
    expect(r.status()).toBe(400);
  });

  test('30 · un nombre con dígitos se rechaza', async () => {
    const r = await admin.post('/api/users', { data: nuevoUsuario({ FullName: 'Usuario 123' }) });
    expect(r.status()).toBe(400);
  });

  // ── Superficie que la medición de cobertura señaló sin tocar ──────────────

  test('31 · reactivar un usuario sin sesión se rechaza', async () => {
    expect((await anon.put(`/api/users/${tecnicoId}/reactivate`)).status()).toBe(401);
  });

  test('32 · un Técnico NO puede reactivar usuarios', async () => {
    const r = await tecnico.put(`/api/users/${tecnicoId}/reactivate`);
    expect([401, 403]).toContain(r.status());
  });

  test('33 · reenviar la activación sin sesión se rechaza', async () => {
    const r = await anon.post(`/api/users/${tecnicoId}/resend-activation`, { data: {} });
    expect(r.status()).toBe(401);
  });

  test('34 · confirmar el correo con un token inventado se rechaza', async () => {
    // Este endpoint es anónimo por necesidad: si aceptara cualquier token,
    // cualquiera activaría cuentas ajenas.
    const r = await anon.post('/api/users/confirm-email', { data: { Token: 'token-inventado' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('35 · confirmar el correo sin token se rechaza', async () => {
    const r = await anon.post('/api/users/confirm-email', { data: {} });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('36 · restablecer la contraseña con un token inventado se rechaza', async () => {
    const r = await anon.post('/api/users/reset-password', {
      data: { Token: 'token-inventado', NewPassword: 'NuevaClave1!' },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('37 · «olvidé mi contraseña» NO revela si el correo existe', async () => {
    // La prueba compara las DOS respuestas, no busca una palabra en una de
    // ellas: lo que hay que garantizar es que sean indistinguibles desde fuera.
    //
    // Antes no lo eran. Un correo sin cuenta recibía 400 «No existe ninguna
    // cuenta registrada…» y uno real 200. Con eso, cualquiera sin credenciales
    // podía averiguar qué direcciones tienen cuenta — y como tres intentos
    // fallidos bloquean una cuenta, enumerar al personal permitía después
    // dejarlo a todo fuera.
    const real = await anon.post('/api/users/forgot-password', {
      data: { Email: USUARIOS.tecnico.email },
    });
    const inventado = await anon.post('/api/users/forgot-password', {
      data: { Email: `zz-nadie-${Date.now()}@test.bo` },
    });

    expect(inventado.status(), 'el código de estado no puede delatar la cuenta')
      .toBe(real.status());

    const mr = (await sobre(real)).message ?? '';
    const mi = (await sobre(inventado)).message ?? '';
    expect(mi.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+/gi, '@'),
      'el texto tampoco puede delatarla')
      .toBe(mr.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+/gi, '@'));
  });

  test('38 · «olvidé mi contraseña» con un correo mal formado se rechaza', async () => {
    const r = await anon.post('/api/users/forgot-password', { data: { Email: 'no-es-correo' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });
});
