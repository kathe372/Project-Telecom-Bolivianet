import { test as setup, expect, Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'fs';
import { USUARIOS } from './apoyo';

/**
 * Inicia sesión y guarda el estado (cookies + localStorage) para las pruebas de
 * navegador.
 *
 * No es una optimización: los endpoints de autenticación admiten 10 peticiones
 * cada 5 minutos POR IP, y `/auth/refresh` —que el SPA llama en cada arranque—
 * cuenta dentro de ese mismo presupuesto. Una suite que iniciara sesión en cada
 * prueba se estrangularía a sí misma y estaría midiendo el limitador en vez del
 * sistema. Bajar el límite para que las pruebas pasaran sería peor todavía:
 * probaríamos una configuración que no es la que se despliega.
 */

async function entrar(page: Page, quien: keyof typeof USUARIOS) {
  const u = USUARIOS[quien];
  await page.goto('/login');
  await page.fill('#Email', u.email);
  await page.fill('#Password', u.password);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20000 });
}

for (const rol of ['admin', 'tecnico'] as const) {
  setup(`iniciar sesión como ${rol}`, async ({ page }) => {
    await entrar(page, rol);
    await page.context().storageState({ path: `e2e/.estado-${rol}.json` });
  });
}

setup('preparar una sesión de técnico con el rol falsificado', async ({ page }) => {
  // ── Por qué hace falta un inicio de sesión PROPIO ──────────────────────────
  // La primera versión copiaba `.estado-tecnico.json` y le cambiaba el rol. No
  // funciona: el backend ROTA el token de refresco en cada uso (correcto, impide
  // reutilizar uno robado), así que ambos archivos compartían una cookie de un
  // solo uso. La prueba del guard la gastaba y esta arrancaba con una caducada,
  // acabando en /login sin haber comprobado nada.
  //
  // Y se falsifica aquí, y no en caliente dentro de la prueba, por dos razones:
  // manipular el rol y volver a navegar exige una SEGUNDA carga de página —otro
  // /auth/refresh contra el presupuesto—, y así se modela mejor la amenaza real:
  // alguien que edita lo que el navegador guarda y ENTONCES abre la aplicación.
  await entrar(page, 'tecnico');
  const ruta = 'e2e/.estado-tecnico-falsificado.json';
  await page.context().storageState({ path: ruta });

  const estado = JSON.parse(readFileSync(ruta, 'utf-8'));
  let falsificado = false;
  for (const origen of estado.origins ?? []) {
    for (const par of origen.localStorage ?? []) {
      if (par.name !== 'telecom-auth') continue;
      const s = JSON.parse(par.value);
      s.state.role = 'Admin';
      par.value = JSON.stringify(s);
      falsificado = true;
    }
  }
  expect(falsificado, 'no se encontró telecom-auth en el estado guardado').toBe(true);
  writeFileSync(ruta, JSON.stringify(estado, null, 2));
});
