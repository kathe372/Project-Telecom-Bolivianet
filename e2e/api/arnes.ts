import { APIRequestContext, request as apiRequest, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Andamiaje compartido de las pruebas E2E de API.
 *
 * ── Por qué las pruebas de API no usan navegador ────────────────────────────
 * Cada carga completa de página del SPA dispara un `/auth/refresh`, y ese
 * endpoint comparte con el login un presupuesto de 10 peticiones cada 5 minutos
 * POR IP (hallazgo DISP-01). Una suite de cientos de casos por navegador es
 * sencillamente imposible contra la configuración real.
 *
 * La salida no es aflojar el límite —eso pondría en verde una configuración que
 * no se despliega— sino no gastarlo: se inicia sesión UNA vez en la preparación
 * y todas las pruebas reutilizan el mismo token, que dura 8 horas. A partir de
 * ahí manda el limitador general, 300 peticiones/minuto por usuario, que sí da
 * margen de sobra.
 *
 * Siguen siendo de extremo a extremo: van por nginx → backend → PostgreSQL
 * contra los contenedores reales, sin dobles ni mocks. Lo que no ejercitan es
 * la interfaz, y para eso están las pruebas de navegador en `e2e/*.spec.ts`.
 */

export const RAIZ = join(__dirname, '..', '..');
export const BASE = 'http://localhost';
const ARCHIVO_ESTADO = join(RAIZ, 'e2e', '.api-estado.json');

export interface EstadoApi {
  tokenAdmin: string;
  tokenTecnico: string;
  adminId: string;
  tecnicoId: string;
  /** Datos base creados una vez y reutilizados por todos los módulos. */
  planId: string;
  planNombre: string;
  clienteId: string;
  clienteTbn: string;
  clienteTelefono: string;
}

export function estado(): EstadoApi {
  if (!existsSync(ARCHIVO_ESTADO)) {
    throw new Error(
      'Falta e2e/.api-estado.json. Ejecutar primero el proyecto "api-preparacion" ' +
      '(npx playwright test) tras scripts/e2e-sembrar-usuarios.sh',
    );
  }
  return JSON.parse(readFileSync(ARCHIVO_ESTADO, 'utf-8'));
}

export const ARCHIVO = ARCHIVO_ESTADO;

/**
 * Un contexto por módulo, creado en `beforeAll` y liberado en `afterAll`.
 *
 * Se intentó compartir tres contextos para toda la suite —memorizándolos en
 * este módulo, que con `workers: 1` es único— para abrir menos conexiones. No
 * funciona: Playwright ata el ciclo de vida de un `APIRequestContext` al archivo
 * donde se crea, así que el segundo módulo recibía uno ya cerrado y fallaba con
 * «Target page, context or browser has been closed».
 *
 * Queda anotado porque el síntoma —el primer caso de un módulo fallando en
 * milisegundos— no señala en absoluto hacia su causa.
 */
async function contexto(token?: string): Promise<APIRequestContext> {
  return apiRequest.newContext({
    baseURL: BASE,
    ...(token ? { extraHTTPHeaders: { Authorization: `Bearer ${token}` } } : {}),
  });
}

/** Contexto autenticado como administrador. */
export const comoAdmin = () => contexto(estado().tokenAdmin);

/** Contexto autenticado como técnico: sirve para comprobar qué NO puede hacer. */
export const comoTecnico = () => contexto(estado().tokenTecnico);

/** Contexto sin credencial alguna. */
export const sinSesion = () => contexto();

/**
 * El sobre de respuesta del proyecto: { success, message?, data? }.
 *
 * Se lee aquí y no en cada prueba porque el sobre ES parte del contrato: el
 * frontend solo mira `message` (`extractApiError`), así que un endpoint que
 * conteste con otra forma deja al usuario sin explicación aunque el código HTTP
 * sea correcto.
 */
export async function sobre(r: { text(): Promise<string> }): Promise<{
  success?: boolean; message?: string; data?: any; crudo: string;
}> {
  const crudo = await r.text();
  try {
    const j = JSON.parse(crudo);
    return { success: j.success, message: j.message, data: j.data, crudo };
  } catch {
    return { crudo };
  }
}

/** Nombre único con prefijo rastreable, para poder limpiar por SQL. */
export function zz(que: string): string {
  return `ZZ-E2E ${que} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

/**
 * Como `zz`, pero sin dígitos.
 *
 * El validador de personas exige «solo letras, espacios y guiones», así que la
 * parte única se construye con letras. No es un capricho del validador: acepta
 * nombres, no identificadores, y conviene que la suite respete esa regla en vez
 * de esquivarla.
 */
export function zzNombre(que: string): string {
  const letras = Array.from({ length: 8 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  // El prefijo tampoco puede ser "ZZ-E2E": lleva un 2. Se usa "ZZ-QA", que
  // sigue empezando por ZZ- y por tanto lo alcanzan igual los borrados de
  // limpieza (LIKE 'ZZ-%').
  return `ZZ-QA ${que} ${letras}`;
}

/** Cédula/teléfono únicos dentro del rango de pruebas. */
export function documentoUnico(): string {
  return `9${Math.floor(Math.random() * 1e7).toString().padStart(7, '0')}`;
}
export function telefonoUnico(): string {
  return `7${Math.floor(Math.random() * 1e7).toString().padStart(7, '0')}`;
}

/**
 * Comprueba que un endpoint exige autorización.
 *
 * Se usa en todos los módulos porque es la comprobación que más barato se
 * pierde: basta que alguien añada un endpoint y olvide el atributo. Acepta 401
 * y 403 —son respuestas distintas a preguntas distintas (quién eres / qué
 * puedes)— pero nunca 200.
 */
export async function exigeAutorizacion(
  ctx: APIRequestContext,
  metodo: 'get' | 'post' | 'put' | 'patch' | 'delete',
  ruta: string,
  cuerpo?: any,
) {
  const r = await (ctx as any)[metodo](ruta, cuerpo ? { data: cuerpo } : undefined);
  expect(
    [401, 403],
    `${metodo.toUpperCase()} ${ruta} respondió ${r.status()} a quien no debería poder`,
  ).toContain(r.status());
}
