import { test, expect, Page } from '@playwright/test';

/**
 * ¿La autorización es real o solo cosmética?
 *
 * El frontend decide qué enseñar leyendo `role` de localStorage, que el usuario
 * puede editar. Eso es correcto SIEMPRE Y CUANDO el backend vuelva a
 * comprobarlo. Aquí se falsifica el rol y se exige que el servidor siga
 * diciendo que no.
 *
 * Ninguna capa por separado puede responder a esto: el test de C# comprueba el
 * atributo [Authorize] y el de React el guard, pero solo de extremo a extremo se
 * ve si la cadena aguanta a alguien que miente.
 *
 * ── Una carga de página por prueba ──────────────────────────────────────────
 * Cada carga completa dispara un `/auth/refresh`, y ese endpoint comparte con el
 * login un presupuesto de 10 peticiones cada 5 minutos POR IP (DISP-01). Una
 * versión anterior de estas pruebas falsificaba el rol en caliente y volvía a
 * navegar: dos cargas, y la segunda recibía 429, la sesión se limpiaba y la
 * prueba terminaba en /login sin haber comprobado nada. El rol falsificado se
 * prepara ahora en el estado guardado.
 */

/** Falla con un mensaje útil si el limitador se interpone. */
function vigilarLimitador(page: Page): { hubo429: () => boolean } {
  let limitado = false;
  page.on('response', r => {
    if (r.url().includes('/api/auth/') && r.status() === 429) limitado = true;
  });
  return { hubo429: () => limitado };
}

test.describe('Autorización — el guard del frontend', () => {
  test.use({ storageState: 'e2e/.estado-tecnico.json' });

  test('un Técnico no llega a la gestión de usuarios', async ({ page }) => {
    const limitador = vigilarLimitador(page);

    await page.goto('/users');
    await expect(page).not.toHaveURL(/\/users$/, { timeout: 20000 });

    expect(limitador.hubo429(),
      'el limitador de autenticación cortó la prueba (DISP-01): espera 5 minutos')
      .toBe(false);
  });
});

test.describe('Autorización — el backend, frente a un rol falsificado', () => {
  // Mismo usuario técnico, pero con `role: "Admin"` escrito en lo que el
  // navegador guarda. Es exactamente lo que puede hacer cualquiera desde las
  // herramientas de desarrollo antes de abrir la aplicación.
  test.use({ storageState: 'e2e/.estado-tecnico-falsificado.json' });

  test('falsificar el rol NO da acceso a los datos', async ({ page }) => {
    const limitador = vigilarLimitador(page);
    const respuestas: number[] = [];
    page.on('response', r => {
      if (r.url().includes('/api/users')) respuestas.push(r.status());
    });

    await page.goto('/users');
    await page.waitForTimeout(4000);

    expect(limitador.hubo429(),
      'el limitador de autenticación cortó la prueba (DISP-01): espera 5 minutos')
      .toBe(false);

    // Con el rol falsificado el frontend SÍ deja pasar —lee lo que le pusieron—
    // y la pantalla llega a pedir los datos. Eso es lo que hace válida la
    // prueba: sin petición, el «no hay 200» no demostraría nada.
    expect(respuestas.length,
      'el frontend no llegó a pedir /api/users: la prueba no demostró nada')
      .toBeGreaterThan(0);

    expect(respuestas.filter(s => s === 200),
      `el backend devolvió 200 a un Tecnico con el rol falsificado (respuestas: ${respuestas})`)
      .toHaveLength(0);
  });
});

test.describe('Autorización — sin sesión', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('cualquier ruta interna manda a /login', async ({ page }) => {
    await page.goto('/clients');
    await expect(page).toHaveURL(/\/login/, { timeout: 20000 });
  });
});
