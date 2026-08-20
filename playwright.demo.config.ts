import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración AISLADA para la suite de demostración de defensa.
 *
 * No toca `playwright.config.ts` ni la suite existente de `e2e/`: se ejecuta con
 *   npx playwright test --config=playwright.demo.config.ts
 *
 * Decisiones pensadas para una demo en vivo, no para CI:
 *  - `workers: 1` y `fullyParallel: false` → la salida en consola sale ordenada y
 *    legible en pantalla. En paralelo los logs se entrelazan y no se entiende nada.
 *  - `retries: 1` → una red intermitente en la sala no pinta la suite en rojo.
 *  - `video`/`trace` solo al fallar → evidencia si algo sale mal, sin ralentizar.
 *
 * Variables de entorno admitidas:
 *   E2E_BASE_URL    (por defecto http://localhost)      — frontend tras Nginx
 *   E2E_API_URL     (por defecto http://localhost:5000) — backend directo, opcional
 *   E2E_NOTIFIER_URL(por defecto http://localhost:8080) — notifier, opcional
 *   E2E_EMAIL / E2E_PASSWORD                            — credenciales de admin
 *   E2E_HEADED=1                                        — abrir navegador visible
 */
export default defineConfig({
  testDir: './e2e-demo',
  timeout: 45_000,
  expect: { timeout: 10_000 },

  fullyParallel: false,
  workers: 1,
  retries: 1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-results/demo-report', open: 'never' }],
  ],
  outputDir: 'e2e-results/demo-artifacts',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost',
    headless: process.env.E2E_HEADED !== '1',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    ignoreHTTPSErrors: true,
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'demo',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e-results/.auth/admin.json',
      },
    },
  ],
});
