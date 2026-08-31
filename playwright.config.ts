import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra el stack real levantado con docker compose
 * (nginx :80 → backend :5000 → PostgreSQL; chatbot :3001 → Redis).
 *
 * Tres familias de pruebas, separadas por lo que cuestan:
 *
 *  - `api-*`  — el grueso, un proyecto por módulo. Comparten UNA sesión abierta
 *               en la preparación, así que no gastan el presupuesto de
 *               autenticación (10 peticiones/5 min por IP, DISP-01).
 *  - `admin`  — recorridos por navegador. Deliberadamente pocos: cada carga
 *               completa de página dispara un /auth/refresh.
 *  - `chatbot`— van directas al chatbot, sin sesión.
 *
 * `workers: 1` porque todas comparten IP y base de datos.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  // Un reintento, y solo uno. NO es para tapar fallos: un aserto realmente roto
  // falla las dos veces. Es para las paradas esporádicas de red del entorno
  // Docker en Windows, que aparecían como timeouts de 30 s en endpoints que
  // medidos a mano responden en 15 ms.
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:80',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    // ── Preparación ────────────────────────────────────────────────────────
    {
      name: 'preparacion',
      testMatch: /apoyo[\\/].*\.setup\.ts|00-preparacion\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Sin `dependencies`: las pruebas de API no necesitan el storageState del
      // navegador, solo los usuarios sembrados en la base. Encadenarlas costaba
      // dos inicios de sesión extra por ejecución contra un presupuesto de 10
      // cada 5 minutos.
      name: 'api-preparacion',
      testMatch: /api[\\/]00-preparacion-api\.setup\.ts/,
    },

    // ── Navegador: PRIMERO, y esto no es cosmético ─────────────────────────
    //
    // El presupuesto de autenticación es de 10 peticiones cada 5 minutos por IP
    // (DISP-01) y lo comparten todos los proyectos. Las pruebas de navegador
    // gastan 5 —una por carga de página, más un login— y NO toleran quedarse sin
    // presupuesto: si el refresco recibe 429, el frontend limpia la sesión y la
    // prueba acaba en /login sin haber comprobado nada.
    //
    // El módulo `09-autenticacion` de la API gasta otras 6 comprobando el
    // contrato del login, pero esas SÍ aceptan un 429 como respuesta válida.
    // Por eso van después: las que no pueden quedarse sin presupuesto, primero.
    {
      name: 'admin',
      testMatch: /e2e[\\/](01-sesion|02-autorizacion)\.spec\.ts/,
      dependencies: ['preparacion'],
      // Sin reintentos: un 429 no se arregla repitiendo, y cada repetición
      // consume otra carga de página del mismo presupuesto que lo agotó.
      retries: 0,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chatbot',
      testMatch: /03-webhook-firma\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // ── API por módulo ─────────────────────────────────────────────────────
    {
      name: 'api',
      testMatch: /api[\\/](?!00-).*\.spec\.ts/,
      dependencies: ['api-preparacion'],
    },
  ],
});
