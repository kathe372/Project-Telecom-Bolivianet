# Pruebas de extremo a extremo

Corren contra el stack real levantado con docker: nginx :80 → backend :5000 →
PostgreSQL, y chatbot :3001 → Redis. No hay dobles ni mocks.

## Ejecutar

```bash
docker compose up -d --build          # los 4 servicios
scripts/e2e-sembrar-usuarios.sh       # crea zz-e2e-admin y zz-e2e-tecnico
npx playwright test
scripts/e2e-limpiar-usuarios.sh       # al terminar
```

## Cómo está organizado, y por qué

Tres familias, separadas por lo que **cuestan en presupuesto de autenticación**.

| Carpeta | Qué prueba | Coste |
|---|---|---|
| `e2e/api/` | **17 módulos, 576 casos** — cubren los 231 endpoints del backend | 2 inicios de sesión en total |
| `e2e/*.spec.ts` | 3 recorridos por navegador | 1 refresco por carga de página |
| `e2e/03-webhook-*` | El chatbot, sin sesión | 0 |

**La restricción que lo explica todo.** Los endpoints de autenticación admiten
**10 peticiones cada 5 minutos por IP**, y `/auth/refresh` —que el SPA llama en
cada carga completa de página— cuenta dentro del mismo presupuesto (hallazgo
DISP-01). Una suite de 365 casos por navegador es imposible contra la
configuración real.

Por eso el grueso va por API: se inicia sesión **una vez** en la preparación y
todas las pruebas reutilizan el mismo token, que dura 8 horas. A partir de ahí
manda el limitador general —300 peticiones/minuto por usuario—, que da margen de
sobra. Siguen siendo de extremo a extremo: atraviesan nginx, el backend y
PostgreSQL contra los contenedores reales. Lo que no ejercitan es la interfaz, y
para eso están las pruebas de navegador.

**No bajes el límite para que quepan más pruebas.** Pondría en verde una
configuración distinta de la que se despliega, y el verde dejaría de significar
algo.

**El orden de los proyectos importa, y no es cosmético.** El reparto real de las
10 peticiones por ventana:

| Proyecto | Gasto | ¿Tolera quedarse sin presupuesto? |
|---|---:|---|
| `preparacion` (3 inicios de sesión) | 3 | — |
| `admin` (navegador): 5 cargas de página y 1 login fallido | 5 | **No.** Un 429 en el refresco hace que el frontend limpie la sesión y la prueba acabe en `/login` sin comprobar nada |
| `api` → módulo `09-autenticacion` | 6 | Sí: acepta 429 como respuesta válida |
| Resto de módulos de API | 0 | — |

Los ocho primeros caben; los seis del módulo 09 **no**, y por eso van al final:
son los únicos que saben convivir con un 429. Por lo mismo `admin` corre con
`retries: 0` — repetir un 429 no lo arregla y consume otra carga de página del
presupuesto que ya se agotó.

Ese reparto es también la razón de que la preparación haga **tres** inicios de
sesión y no dos: el técnico necesita una segunda sesión, con su propia cookie,
para la prueba del rol falsificado. Compartirla no vale, porque el token de
refresco rota.

La preparación **reutiliza el token anterior si sigue vivo** (lo comprueba contra
un endpoint real), así que ejecutar la suite varias veces seguidas no gasta nada.
Solo las pruebas de navegador consumen presupuesto; si dos ejecuciones seguidas
fallan con `Demasiadas solicitudes`, espera cinco minutos.

## Los 17 módulos

`planes`, `clientes`, `facturación`, `pagos`, `tickets`, `instalaciones`,
`cobertura`, `usuarios y auditoría`, `autenticación`, `dashboard`,
`notificaciones`, `chatbot`, `cambios de plan`, `horarios y feriados`,
`catálogos y configuración`, `agenda de instalaciones` y `cierre de sesión`.

**Cobertura de la API: 231 de 231 endpoints (100 %)**, medida sobre el tráfico
real de una ejecución cruzado con el inventario de rutas de los controladores.

Cada uno cubre las mismas dimensiones: quién NO puede entrar (sin sesión y con el
rol equivocado), qué se rechaza y con qué mensaje, qué pasa con identificadores
inexistentes o mal formados, y las reglas de negocio propias del módulo.

**Dos criterios que conviene mantener al añadir casos:**

1. **Ningún caso prueba contraseñas equivocadas contra cuentas reales.** Tres
   fallos bloquean la cuenta, y un administrador bloqueado impide arrancar el
   backend si falta `ADMIN_RESET_PASSWORD`. Una suite de pruebas no debe poder
   tumbar un despliegue.
2. **Toda prueba que verifique un rechazo necesita su contraprueba.** Comprobar
   solo que algo se rechaza se satisface igual de bien rompiendo el sistema
   entero — es la forma más fácil de «arreglar» un agujero sin darse cuenta.

## Cuatro trampas del andamiaje, anotadas para no repetirlas

Costaron rato porque el síntoma no señalaba hacia la causa:

1. **`page.goto()` a la URL en la que ya estás no recarga la aplicación.** La
   prueba parecía no hacer nada. Si necesitas un arranque en frío, navega a otra
   ruta primero o usa `reload()` — y recuerda que `reload()` recarga la URL
   **actual**, que tras una redirección ya no es la que pediste.

2. **El token de refresco rota en cada uso.** Un `storageState` guardado sirve
   para **un** arranque en frío; la segunda prueba que parta del mismo archivo
   acabará en `/login`. Es el sistema comportándose bien: el andamiaje es el que
   se adapta.

3. **`logout` invalida el TOKEN, no la conexión.** Probar el camino feliz de
   cerrar sesión desde otro contexto HTTP no aísla nada: el token es compartido
   por los diecisiete módulos, y hacerlo dejó 64 pruebas en 401. Vive en
   `17-cierre-sesion.spec.ts`, que corre el último y usa el token del técnico.

4. **Un `APIRequestContext` pertenece al archivo donde se crea.** Compartirlos
   entre módulos para abrir menos conexiones falla con «Target page, context or
   browser has been closed», y el síntoma es el *primer* caso del módulo
   siguiente fallando en milisegundos. Cada módulo crea los suyos en `beforeAll`
   y los libera en `afterAll`.

Queda además `retries: 1` en la configuración. **No es para tapar fallos** —un
aserto realmente roto falla las dos veces—, sino para una parada esporádica de
~30 s en el reenvío de puertos de Docker en Windows: el backend no registra nada
y los mismos endpoints, medidos a mano, responden en 15 ms.

## Qué encontró

Además de fijar el comportamiento, esta suite descubrió **siete defectos reales**,
todos corregidos y documentados en `ANALISIS_CODIGO_2026-08-30_SEGUNDA_PASADA.md`
(API-01 a API-07). Los dos más graves:

- un `POST {}` a `send-masivo` anunciaba a toda la cartera que le habían
  suspendido el servicio;
- `forgot-password` respondía distinto según existiera o no la cuenta, lo que
  permitía enumerar al personal sin credenciales — y, con el bloqueo a los tres
  intentos, dejarlo a todo fuera.

Y de paso fijó cuatro reglas de negocio que solo vivían en el código, entre ellas
que un downgrade de plan **no** se puede aplicar a mitad de mes.
