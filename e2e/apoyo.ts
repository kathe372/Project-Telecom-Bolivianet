import { Page } from '@playwright/test';

/**
 * Usuarios sembrados para E2E.
 *
 * El prefijo `zz-e2e-` no es decorativo: permite localizarlos y borrarlos por
 * SQL sin tocar datos reales. Se crean con `scripts/e2e-sembrar-usuarios.sh`.
 *
 * No se usa la cuenta de administrador real a propósito: tres intentos fallidos
 * la bloquean, y un administrador bloqueado hace fallar el arranque del backend
 * si no está `ADMIN_RESET_PASSWORD`. Una suite de pruebas no debe poder tumbar
 * un despliegue.
 */
export const USUARIOS = {
  admin:   { email: 'zz-e2e-admin@test.bo',   password: 'E2ePrueba2026!', rol: 'Admin'   },
  tecnico: { email: 'zz-e2e-tecnico@test.bo', password: 'E2ePrueba2026!', rol: 'Tecnico' },
};

/**
 * Lee la sesión que zustand persiste en localStorage.
 * Comprobar QUÉ se guarda es parte de la prueba: el token de acceso no debe estar.
 */
export async function sesionPersistida(page: Page): Promise<any> {
  const crudo = await page.evaluate(() => localStorage.getItem('telecom-auth'));
  return crudo ? JSON.parse(crudo) : null;
}
