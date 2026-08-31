import { test, expect } from '@playwright/test';
import { sesionPersistida, USUARIOS } from './apoyo';

/**
 * Sesión, de extremo a extremo: navegador → nginx → backend → PostgreSQL.
 *
 * Cubre algo que ningún test de integración en C# puede ver: QUÉ deja el
 * frontend guardado en el disco del navegador. Es una decisión del cliente
 * (`partialize` en authStore), invisible desde el servidor.
 *
 * ── Por qué hay pocas pruebas y muy cargadas ────────────────────────────────
 * Cada carga completa de página dispara `initializeAuth` → POST /auth/refresh,
 * y ese endpoint comparte con el login un presupuesto de 10 peticiones cada 5
 * minutos POR IP (ver DISP-01 en el informe). Una prueba por comportamiento,
 * cada una con su `goto`, agota el presupuesto a mitad de la suite y falla por
 * el limitador en vez de por el sistema.
 *
 * Se podría bajar el límite para que la suite respirara. No se hizo: pondría en
 * verde una configuración que no es la que se despliega, y el verde dejaría de
 * significar algo. Se agrupan las comprobaciones para gastar menos.
 */
test.describe('Sesión', () => {
  test.use({ storageState: 'e2e/.estado-admin.json' });

  test('el token no se persiste, y aun así la sesión sobrevive a recargar', async ({ page, context }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20000 });
    // `/` redirige del lado del cliente a la pantalla que corresponde al rol.
    // Hay que dejar que esa redirección termine antes de tomar la referencia,
    // o se compara la URL de partida con la de destino y no coinciden nunca.
    await page.waitForLoadState('networkidle');
    const destino = page.url();
    expect(destino, 'la redirección por rol debe haber ocurrido').not.toMatch(/localhost\/$/);

    // 1. En disco no puede haber token.
    const guardado = await sesionPersistida(page);
    expect(guardado, 'debe persistirse algo de sesión').not.toBeNull();
    expect(JSON.stringify(guardado)).not.toContain('eyJ');   // ningún JWT
    expect(guardado.state.token, 'el token no puede llegar al disco').toBeUndefined();
    expect(guardado.state.email).toBe(USUARIOS.admin.email);

    // 2. Y sin embargo seguimos dentro tras recargar. Las dos mitades juntas
    //    dicen algo que ninguna dice sola: que el refresco por cookie funciona.
    await page.reload();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20000 });
    await page.waitForLoadState('networkidle');
    expect(page.url(), 'recargar no debe sacarte de donde estabas').toBe(destino);

    // 3. Sin esa identidad ni esa cookie, no se entra. (Navegar sin sesión no
    //    llama a /auth/refresh, así que este tramo no gasta presupuesto.)
    await page.evaluate(() => localStorage.removeItem('telecom-auth'));
    await context.clearCookies();
    await page.goto('/clients');
    await expect(page).toHaveURL(/\/login/, { timeout: 20000 });
  });
});

test.describe('Sesión — credenciales inválidas', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('el motivo del rechazo LLEGA al usuario', async ({ page }) => {
    // El frontend lee solo `message` del sobre de error (`extractApiError`).
    // Si el backend contestara con otro campo, el usuario vería el texto
    // genérico de reserva y aquí no habría mensaje que mostrar.
    await page.goto('/login');
    await page.fill('#Email', USUARIOS.admin.email);
    await page.fill('#Password', 'ContrasenaEquivocada9!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('p.text-red-700')).toBeVisible({ timeout: 15000 });
  });
});
