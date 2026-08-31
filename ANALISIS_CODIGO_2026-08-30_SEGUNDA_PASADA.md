# Análisis de código — segunda pasada

**Fecha:** 2026-08-30 · **Commit base:** `74b8523` · **Stack:** levantado con `docker compose`

---

## Por qué otra pasada, y sobre qué

La pasada anterior (`ANALISIS_CODIGO_2026-08-30.md`) declaraba su propio hueco:

> «el frontend React (219 archivos) **solo se midió, no se leyó**. El notifier Python
> se revisó únicamente donde toca la base compartida. Del chatbot se leyó la
> estructura y los puntos críticos, **no sus 158 clases**.»

Eso es exactamente lo que cubre esta segunda pasada. No repite el backend C#, que
ya se recorrió clase por clase; entra donde no se había entrado.

**Y añade algo que la primera no podía hacer:** ejecutar el sistema. Los cuatro
servicios se levantaron con `docker compose` —backend y frontend reconstruidos
desde el commit actual— y varias conclusiones de aquí **no son lecturas de código
sino observaciones de comportamiento**. Eso importa: dos de los hallazgos son de
un tipo que ninguna lectura estática encuentra, porque no están en ninguna clase
sino en el **orden** en que se ejecutan las cosas.

---

## Tamaño de lo que se revisó

| Servicio | Archivos | Líneas | Mediana | Pruebas |
|---|---:|---:|---:|---|
| Frontend React | 189 | 24.523 | 100 | 32 archivos |
| Chatbot NestJS | 164 | 15.765 | 69 | 122 suites / 1.479 tests |
| Notifier Python | 18 | ~2.000 | — | 8 archivos |

Las medianas siguen siendo sanas: 100 y 69 líneas. El archivo más grande del
frontend tiene 522 líneas. **No hay clases monstruo en el frontend**, y eso
descarta de entrada toda una familia de problemas.

---

# Hallazgos

## SEG-01 · El webhook cuenta y responde antes de comprobar quién llama — **CORREGIDO**

**Severidad: alta.** Es el hallazgo importante de esta pasada.

La firma HMAC de Meta se verificaba **dentro del método del controlador**
(`whatsapp-webhook.controller.ts:89`). En NestJS el middleware corre **antes** que
el controlador. Y sobre esa misma ruta había registrado un middleware:

```ts
consumer.apply(PhoneRateLimiterMiddleware)
        .forRoutes({ path: 'webhook', method: RequestMethod.POST });
```

`PhoneRateLimiterMiddleware` lee el teléfono del cuerpo —`entry[0].changes[0].value.messages[0].from`—,
lo cuenta en Redis y, al pasar del límite, **envía un WhatsApp de aviso a ese
número**. Todo ello sobre un cuerpo que nadie ha autenticado todavía.

**Comprobado contra el contenedor, no deducido.** Tres peticiones sin firma:

```
intento 1 -> HTTP 401 : {"message":"Firma X-Hub-Signature-256 requerida"...}
intento 2 -> HTTP 401 : ...
intento 3 -> HTTP 401 : ...
contador rl:59100000000 -> 3     (TTL 56s)
```

Las tres fueron **rechazadas** y las tres **dejaron rastro**. Continuando hasta
pasar el umbral, el log del chatbot:

```
WARN [PhoneRateLimiterMiddleware] Rate limit excedido para 59100000000
LOG  [WhatsApp[MOCK]] 📤 → 59100000000
```

Es decir: **sin credencial alguna se logró que el sistema ordenara un envío al
número elegido por quien hizo la petición.** En local `WHATSAPP_MOCK=true` lo
deja en un log; en producción está en `false` y es un mensaje real desde el
número verificado de la empresa.

**Dos consecuencias, ambas explotables por cualquiera que alcance la URL:**

1. **Denegación de servicio dirigida.** Envenenar el contador de un cliente real
   —su número es adivinable— para que sus mensajes legítimos reciban 429.
2. **Envío saliente arbitrario.** Un mensaje por número y ventana, pero los
   números son ilimitados. Coste por conversación en Meta, y el número verificado
   del negocio expuesto a que lo denuncien y lo bloqueen.

**El arreglo** no es reforzar el limitador: es **autenticar antes de contar**. Se
extrajo la verificación a una función compartida (`webhook-signature.ts`) y un
middleware que se registra **delante** del limitador:

```ts
.apply(WebhookSignatureMiddleware, PhoneRateLimiterMiddleware)
```

Tres decisiones que conviene explicar:

- **Las respuestas son idénticas a las de antes** — 401 si falta la firma, 200
  silencioso si es inválida. Ese 200 es deliberado: un error haría que Meta
  reintentara en bucle. Cambiarlo habría arreglado la seguridad rompiendo la
  integración.
- **El controlador conserva su comprobación.** Es barata y evita que reordenar el
  registro de middleware vuelva a abrir el hueco sin que nadie se entere.
- **Una sola función para las dos.** Dos copias del HMAC podrían separarse, y la
  que corriera primero decidiría quién entra.

**Verificado en las dos direcciones.** Cubierto por
`webhook-signature.middleware.spec.ts` (5 pruebas) y por las cuatro de
`e2e/03-webhook-firma.spec.ts`, contra el contenedor reconstruido:

- Las tres que exigen que una petición sin firma **no haga nada** —ni contar ni
  enviar— **fallaban antes del arreglo y pasan después**.
- La cuarta es la contraprueba, y no es un adorno: comprueba que una petición
  **con firma válida sigue procesándose**. Sin ella, un middleware que rechazara
  absolutamente todo dejaría las otras tres en verde con el webhook roto del
  todo — que es la forma más fácil de «arreglar» un problema de seguridad.

---

## DISP-01 · El límite de autenticación se reparte por IP, y una oficina es una sola IP

**Severidad: media.** No está corregido: la decisión es del negocio.

`RateLimitConfiguration.cs`: los endpoints de autenticación admiten **10
peticiones cada 5 minutos**, particionadas por IP cuando quien llama es anónimo.
El comentario en el código explica el porqué:

> «Login y refresco: por IP. Un atacante contra una cuenta no puede bloquear el
> acceso del resto de la organización.»

El razonamiento protege de un ataque dirigido a *una cuenta*. Pero la partición
por IP tiene el efecto contrario del que busca cuando **la organización entera
sale por una sola IP con NAT**, que es como trabaja una oficina. Entonces «por
IP» y «toda la organización» son lo mismo.

Y hay un multiplicador: **`/auth/refresh` es `[AllowAnonymous]` y cae bajo la
misma política**. El SPA lo llama en cada arranque (`initializeAuth`). Cada
pestaña que se abre, cada recarga, consume del presupuesto compartido.

**Observado, no supuesto:** una suite de ocho pruebas E2E no puede ejecutarse dos
veces seguidas en cinco minutos. Los fallos no eran del sistema:

```
{"success":false,"message":"Demasiadas solicitudes. Por favor espere e intente nuevamente."}
```

Si ocho cargas de página en cinco minutos agotan el presupuesto, cuatro o cinco
empleados en la misma oficina lo agotan sin hacer nada raro — y el mensaje que
reciben bloquea también el *login*.

**Un segundo dato, tropezado sin querer y más elocuente que el primero.** Para
esperar a que la ventana se liberase dejé un sondeo consultando `/auth/refresh`
**cada 10 segundos**. Estuvo más de diez minutos recibiendo 429 seguidos: ese
ritmo de consulta —seis peticiones por minuto, nada para un servidor— basta por
sí solo para **mantener bloqueada la IP entera de forma indefinida**. Es la misma
propiedad vista desde el otro lado: no hace falta un ataque, basta con actividad
rutinaria y compartir salida a internet.

**Y un tercero, el más concreto de todos.** Al ampliar las pruebas, una de
autorización falló de una forma que costó rato entender: terminaba en `/login`
sin haber comprobado nada. El motivo, ya con instrumentación:

```
200 /api/auth/refresh     ← primera carga de página
200 /api/alerts
429 /api/auth/refresh     ← segunda carga de la MISMA prueba
```

La segunda carga recibió 429, el frontend interpretó correctamente que la sesión
no valía, la limpió y redirigió. Es decir: **dos cargas de página dentro de una
sola prueba ya no caben en el presupuesto.** Traducido a personas, un empleado
que abra la aplicación, la recargue y abra una pestaña más consume tres de las
diez peticiones que tiene **toda la oficina** cada cinco minutos.

Lo relevante no es que incomode a las pruebas —eso se rediseña, y se hizo—, sino
que el mismo techo lo tienen los usuarios reales y ahí no hay rediseño posible.

**Nota aparte:** `PermitLimit = 10` y `Window = 5 min` están **escritos a fuego**,
no vienen de `IConfiguration`. No se pueden ajustar por entorno ni para CI sin
recompilar.

*No lo toqué.* Aflojar un límite de seguridad no es una decisión técnica que deba
tomar solo, y hay al menos tres salidas razonables (particionar el refresco por
usuario en vez de por IP; separar el presupuesto de refresco del de login; hacer
ambos configurables). Conviene decidirlo, no que lo decida yo.

---

## FE-01 · Un fallo de carga y «no hay datos» se ven exactamente igual

**Severidad: media.** Engaña en vez de romper, que en facturación es peor.

Diez sitios del frontend capturan errores y no hacen nada con ellos. Algunos son
legítimos —que falle `logout` no debe impedir limpiar la sesión local—. Otros no:

```ts
// HistoryTab.tsx:38
try   { setData(await getClientHistorial(clientId, page, 25, tipo)); }
catch {  }
finally { setLoading(false); }
```

Si la petición falla, `data` se queda en `null` y `loading` pasa a `false`: la
pestaña se dibuja **como si el cliente no tuviera historial**. Para quien atiende,
«sin incidencias previas» y «no pudimos cargarlo» son hechos muy distintos, y en
pantalla son el mismo.

El mismo patrón en `ClientProfilePage.loadGrid` afecta a la **rejilla de
facturas**: un error se ve como si el cliente no debiera nada.

Lo que confirma que es descuido y no criterio: **cinco líneas antes, en el mismo
archivo**, `loadClient` sí lo hace bien —`catch { setError('No se pudo cargar el
perfil del cliente.'); }`—.

`TicketDetailModal.reload` es una variante: tras cambiar el estado, si la recarga
falla la pantalla sigue mostrando lo viejo, así que el usuario cree que su cambio
no se aplicó y lo repite.

---

## CB-01 · Dos repositorios del chatbot que no están conectados, con pruebas que pasan

**Severidad: media**, por la confianza falsa más que por el código muerto.

`ClientRepositoryService` y `TicketRepositoryService` (48 + 85 líneas) implementan
sus interfaces y **no están registrados en ningún módulo**. Los tokens apuntan a
otra clase:

```ts
{ provide: TICKET_REPOSITORY, useExisting: SistemaApiService },
```

Lo grave no es que sobren 133 líneas. Es que tienen **148 líneas de pruebas que
pasan**, y esas pruebas fijan rutas que **no existen en el backend**:
`/api/tickets/{id}/reprogramar` cuando el endpoint real es `/reschedule`;
`/close` y `/reopen` frente a `/status`.

O sea: la suite da luz verde a un cliente HTTP que, si alguien lo conectara,
fallaría contra todos esos endpoints. Y el propio código lo sospecha —

> «NOTA: esta clase no está registrada en app.module.ts […] parece código muerto,
> **no confirmado en uso**.»

— pero la sospecha lleva escrita desde 2026-08 sin que nadie la resolviera. Un
comentario que documenta una duda no la cierra; quien lo escribió estaba a un
`grep` de saberlo.

---

## CB-02 · La imagen del chatbot compila y arrastra lo que nadie usa

**Severidad: media.** Fragilidad de build, y es la causa de un fallo real de hoy.

El `Dockerfile` de producción instala:

```dockerfile
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-spa vips-dev python3 make g++ curl
```

Comprobado sobre el código:

- **`tesseract-ocr` + datos en español**: **cero referencias en todo el
  repositorio** —ni código, ni `package.json`, en ningún servicio—. El OCR se
  eliminó del proyecto y su motor sigue viajando en la imagen; de hecho se
  instala **en las dos etapas** del `Dockerfile` (líneas 28 y 54), así que se
  paga dos veces.
- **`sharp`**: está en `dependencies`, y **no se importa en ningún archivo**.
- **`vips-dev`**: al haber libvips global, `sharp` **descarta el binario
  precompilado y compila desde fuente**. De ahí `python3`, `make` y `g++` — y una
  descarga de cabeceras de Node **en tiempo de build**.

Eso último no es teórico: **el build falló hoy exactamente ahí**.

```
npm error sharp: Detected globally-installed libvips v8.17.3
npm error sharp: Building from source via node-gyp
npm error gyp http fetch GET .../node-v20.20.2-headers.tar.gz attempt 1 failed with ETIMEDOUT
```

El build de producción depende de que responda un servidor de terceros, para
compilar una librería nativa que ningún archivo importa. La imagen pesa **1,28 GB
frente a los 493 MB del backend**.

*No lo toqué:* quitar una dependencia y reescribir el `Dockerfile` toca el
despliegue, y la instrucción vigente es trabajar sin desplegar. Es un cambio de
diez minutos cuando se decida.

---

## DEP-01 · `multer` 1.x, con vulnerabilidades conocidas, en la ruta de subida de archivos

**Severidad: media**, a confirmar con `npm audit`.

El propio build lo avisa:

```
npm warn deprecated multer@1.4.5-lts.2: Multer 1.x is impacted by a number of
vulnerabilities, which have been patched in 2.x.
```

No es una dependencia decorativa: `multer` es lo que procesa los archivos que
entran. Junto a él, `glob@10.5.0` avisa de lo mismo.

---

## ARQ-01 · Ocho interfaces segregadas que apuntan todas a la misma clase de 29 métodos

**Severidad: baja.** Se anota porque es un caso de manual, no porque urja.

`SistemaApiService` tiene **29 métodos públicos**: clientes, facturas, planes,
instalaciones, tickets, CSAT, estados de entrega, cambios de plan, cobertura y
configuración. Y en `app.module.ts`:

```ts
{ provide: CLIENT_REPOSITORY,       useExisting: SistemaApiService },
{ provide: TICKET_REPOSITORY,       useExisting: SistemaApiService },
{ provide: PLAN_REPOSITORY,         useExisting: SistemaApiService },
{ provide: INSTALLATION_REPOSITORY, useExisting: SistemaApiService },
{ provide: PAYMENT_REPOSITORY,      useExisting: SistemaApiService },
{ provide: NOTIFICATION_REPOSITORY, useExisting: SistemaApiService },
{ provide: BOT_CONFIG_REPOSITORY,   useExisting: SistemaApiService },
{ provide: COVERAGE_REPOSITORY,     useExisting: SistemaApiService },
```

**Y esto está más bien que mal.** El Principio de Segregación de Interfaces habla
de lo que ve *quien consume*: cada herramienta depende de 3 o 4 métodos, no de 29,
y se puede sustituir en pruebas sin conocer el resto. Eso ya se cumple.

Lo que queda pendiente es partir la implementación, y ahí conviene ser honesto:
**es trabajo mecánico de bajo retorno**, porque el beneficio de diseño ya está
cobrado por las interfaces. Lo anoto por dos detalles concretos que sí molestan:
`buildTicketSubject` es una **función pura viviendo dentro de un cliente HTTP**, y
las dos clases de CB-01 son justamente el intento a medias de esta separación.

---

## FE-02 · El formateador compartido existe y no lo usa nadie

**Severidad: baja.** Cosmético, pero visible para el usuario.

`utils/format.ts` define `fmtBs`, `fmtDate`, `fmtDateLong`, `fmtTime`. **Cero
importaciones.** Mientras tanto, **39 llamadas repartidas en más de 20 archivos**
formatean fechas a mano, en cuatro presentaciones distintas:

| Forma | Sitios | Se ve como |
|---|---:|---|
| `toLocaleDateString('es-BO')` | 33 | `30/8/2026` |
| `{ day:'2-digit', month:'short', year:'numeric' }` | 2 | `30 ago 2026` |
| `{ day:'2-digit', month:'short' }` | 2 | `30 ago` |
| otras | 3 | — |

La misma fecha se ve distinta según la pantalla. Y hay **dos grafías del mismo
objeto** (`day:'2-digit'` y `day: '2-digit'`), rastro de copiar y pegar.

Sin usar, además: `hooks/usePolling.ts` (21 líneas, con 36 de pruebas y **ningún
llamador**), `hooks/useGeolocation.ts`, `utils/env.ts`, `utils/svgMath.ts`.

---

## PRU-01 · Había configuración de E2E y no había pruebas E2E

`playwright.config.ts` estaba versionado, con `testDir: './e2e'`… y **el
directorio `e2e/` no existía**. Cero pruebas de extremo a extremo.

Resuelto en esta pasada; ver la sección siguiente.

---

# Las pruebas E2E

Nuevas, contra el stack real levantado con docker: navegador → nginx → backend →
PostgreSQL, y por separado chatbot → Redis. **11 en verde**, sin dobles ni
mocks. Cómo ejecutarlas: `e2e/README.md`.

**Qué cubren que las otras capas no pueden cubrir.** No se trata de repetir lo ya
probado. Cada una responde a algo que ninguna prueba unitaria o de integración
puede ver:

| Prueba | Por qué solo aquí |
|---|---|
| El token **no** se persiste en el navegador | Es una decisión del cliente (`partialize`), invisible desde el servidor |
| La sesión sobrevive a recargar | Contraprueba de la anterior: sin token en disco, solo puede seguir dentro si la cookie de refresco funciona |
| Sin identidad ni cookie no se entra | Cierra el triángulo: descarta que lo anterior pase por algún otro motivo |
| Falsificar el rol en `localStorage` no da datos | El test de C# ve el atributo `[Authorize]`, el de React ve el guard; **solo aquí se ve si la cadena aguanta a alguien que miente** |
| El motivo del rechazo llega al usuario | El frontend lee solo `message`; que el backend use otro campo no rompe ningún test de servidor |
| El webhook sin firma no cuenta ni envía | El fallo estaba en el **orden** entre middleware y controlador, que no aparece en ninguna clase |
| El webhook **con** firma sí procesa | Contraprueba: sin ella, un middleware que rechazara todo dejaría lo anterior en verde con el webhook roto |
| La verificación GET de Meta sigue viva | Ampliar `forRoutes` a todos los métodos impediría dar de alta la URL, y no rompería ninguna otra prueba |

**Sobre las dos contrapruebas.** Las filas 3, 7 y 8 no comprueban ningún
comportamiento nuevo: existen para que las otras no puedan pasar por el motivo
equivocado. Una prueba de seguridad que solo verifica que algo se rechaza se
satisface igual de bien rompiendo el sistema entero, y es el modo más común de
«arreglar» un agujero sin darse cuenta.

**Una decisión de diseño que conviene explicar.** La primera versión iniciaba
sesión en cada prueba y se estrangulaba sola contra el límite de DISP-01. Había
dos salidas: bajar el límite, o respetarlo. Bajarlo habría hecho pasar las pruebas
**midiendo una configuración que no es la que se despliega** — es decir, comprando
el verde a cambio de que dejara de significar algo.

Se optó por respetarlo, en dos pasos:

1. **Entrar una vez por rol** y reutilizar el estado (`storageState`), en lugar de
   iniciar sesión en cada prueba.
2. **Agrupar comprobaciones** para gastar menos cargas de página, porque cada
   carga completa dispara un `/auth/refresh` que cuenta contra el mismo
   presupuesto. Por eso `01-sesion` tiene una prueba larga en vez de tres cortas:
   se pierde algo de aislamiento y se gana que la suite mida el sistema y no el
   limitador.

El límite se queda como está — y de hecho fue la propia suite la que lo puso en
evidencia.

---

# Cinco fallos que encontró la suite por módulos

Al ampliar las pruebas a **365 casos, 30 por módulo**, aparecieron cinco defectos
que ninguna de las pasadas de lectura había visto. Los cinco están corregidos y
con prueba que falla sin el arreglo.

Vale la pena decir por qué no salieron antes: **ninguno se ve leyendo la clase.**
Tres solo se manifiestan al ejecutar la consulta contra PostgreSQL o al enlazar
un parámetro ausente; dos dependen de cómo se combinan atributos y condiciones,
no de lo que dice cada línea.

## API-01 · El informe de recaudación llevaba roto desde siempre

`GET /api/payments/collection-report` devolvía **500 con cualquier rango de
fechas**. La causa, en `PaymentReportService`:

```csharp
.GroupBy(p => p.RegisteredBy != null ? p.RegisteredBy.FullName : "Sistema")
.Select(g => new CollectionByUserDto(g.Key, g.Count(), g.Sum(p => p.Amount)))
```

Una clave de agrupación condicional sobre una propiedad de navegación obliga a
EF a resolver un JOIN y agregar sobre el identificador transparente, y eso no lo
sabe traducir a SQL: `InvalidOperationException` en toda llamada. El comentario
encima decía «el desglose por operador también se agrega en SQL» — la intención
era correcta y el código no se ejecutaba nunca.

**Corregido** agrupando por el `Guid` (que sí se traduce) y resolviendo los
nombres en una segunda consulta acotada. Ahora responde 200 con el desglose:
`ByUser: [{ UserName: "Administrador del Sistema", Count: 5, Total: 935.77 }, …]`.

De paso, el compilador aclaró que `RegisteredByUserId` **no es anulable**: el
`!= null` original cubría un caso que el modelo no permite.

## API-02 · Un parámetro ausente que reventaba en 500

`GET /api/payments/check-duplicate` sin `paidAt` daba 500. El enlace de modelos
dejaba el `DateTime` en `MinValue` y el servicio hacía `paidAt.AddDays(-3)`: por
debajo de la fecha mínima representable. **Corregido** haciendo el parámetro
anulable y devolviendo 400 con el motivo.

## API-03 · Un POST vacío anunciaba a toda la cartera que le habían cortado el servicio

**El más grave de los cinco.** `POST /api/config/notifications/send-masivo` con
cuerpo `{}` devolvía **200 y se ejecutaba**:

```
{"Enviados":0,"OmitidosAntispam":7,"SinTelefono":0}
```

`BulkSendDto` no tenía validador. Con el cuerpo vacío, `Tipo` se enlazaba al
primer valor del enum —que es **`SUSPENSION`**— y `SegmentId` quedaba nulo, que
en `LoadTargetClientsAsync` significa *todos los clientes activos*.

Es decir: un `{}` mal enviado —un reintento que pierde el cuerpo, una petición
mal formada— manda a la cartera entera un aviso de suspensión de servicio. En la
prueba solo lo frenó la ventana antispam de 24 h, que había atrapado a esos 7
clientes por envíos previos. Con la ventana limpia, habrían salido.

**Corregido** haciendo `Tipo` anulable —para distinguir «ausente» de «el primer
valor del enum»— y rechazando su ausencia en el controlador **y** en el
servicio. La segunda guarda es deliberada: este servicio escribe a toda la
cartera y no debe depender de que quien lo llame se haya acordado.

## API-04 · El mapa de cobertura estaba roto para los técnicos

`CoverageAdminController` tenía `[Authorize(Policy = "AdminOnly")]` a nivel de
clase. Cinco de sus acciones declaran `AdminOrTecnico`… pero los atributos **se
exigen los dos** (D-25), así que el piso de la clase las anulaba: un técnico
recibía 403 en `/api/coverage/zones`.

No era teórico. El frontend deja al técnico abrir esa pantalla
(`allowedRoles={['Admin','Tecnico']}`), así que **el mapa se le quedaba vacío sin
explicar por qué**.

Lo llamativo: las 14 acciones ya tenían su `[Authorize]` fijado explícitamente en
F9, y el comentario decía que se fijaban *precisamente* para poder ampliar el
piso sin abrir nada. Se hizo la preparación y no se dio el paso. **Corregido**
bajando el piso a `AdminOrTecnico`; las 10 acciones `AdminOnly` siguen siéndolo.

## API-05 · Una regla de validación que solo saltaba en el caso para el que NO se escribió

El validador de tickets exige la cédula del prospecto cuando no hay cliente.
Pero:

| Petición | Resultado |
|---|---|
| `ProspectIdentityCard: null`, sin cliente | **200 — ticket creado sin identidad** |
| `ProspectIdentityCard: ""`, sin cliente | 400 «Se requiere la cédula…» |

La causa es el alcance de `When` en FluentValidation: por defecto **se aplica a
todas las reglas anteriores de la cadena**, no solo a la que precede.

```csharp
.NotEmpty().When(x => !x.ClientId.HasValue)          // ← intención
.MaximumLength(30).When(x => x.ProspectIdentityCard is not null)   // ← lo pisa
```

El segundo `When` se propaga hacia atrás y condiciona el `NotEmpty` a que el
campo **no sea nulo**, que es justo el caso contra el que protegía.

**Corregido** con `ApplyConditionTo.CurrentValidator` en las tres cadenas
afectadas (`ProspectName`, `ProspectIdentityCard`, `ResolutionMessage`). Un
barrido automático confirmó que no hay más: el patrón solo aparece donde un
`NotEmpty()` va seguido de otro `When` en la misma cadena.

En `ResolutionMessage` el hueco lo tapaba el dominio —`SupportTicket.Resolver()`
rechaza un mensaje en blanco desde E-04—, así que no llegó a guardarse ningún
ticket resuelto sin explicación. Es un argumento a favor de haber puesto esas
reglas en la entidad: el validador falló y la entidad aguantó.

---

# Cerrando los huecos: dos fallos más y cuatro reglas que nadie había escrito

Al cubrir los 85 endpoints que la medición señaló sin tocar aparecieron dos
defectos nuevos —uno de seguridad— y varias reglas de negocio que solo existían
en el código.

## API-06 · Enumeración de usuarios en «olvidé mi contraseña» — **CORREGIDO**

**Severidad: alta.** `POST /api/users/forgot-password` distinguía cuatro
situaciones para quien llamaba **sin credenciales**:

| Petición | Antes |
|---|---|
| Correo sin cuenta | **400** «No existe ninguna cuenta registrada con ese correo» |
| Cuenta desactivada | **400** «Esta cuenta está desactivada» |
| Cuenta sin activar | **400** «Esta cuenta aún no ha sido activada» |
| Correo con cuenta activa | **200** |

Cualquiera podía probar direcciones y averiguar cuáles tienen cuenta, y hasta en
qué estado está cada una.

**Lo que lo hace grave aquí y no en otro sistema:** tres intentos fallidos
bloquean una cuenta. Enumerar al personal permite después **dejarlo a todo
fuera** — y si el bloqueado es el administrador, además impide arrancar el
backend cuando falta `ADMIN_RESET_PASSWORD`.

Alguien ya había pensado en la privacidad: la respuesta enmascara el destino
(`z***@test.bo`). Pero la diferencia entre 400 y 200 deshacía ese cuidado.

**Corregido** devolviendo siempre la misma respuesta, con el motivo real solo en
el log del servidor. Se sigue rechazando una dirección **mal formada**: eso se
decide sin mirar la base y no filtra nada.

La prueba que lo fija **compara las dos respuestas** en lugar de buscar una
palabra en una de ellas — lo que hay que garantizar es que sean indistinguibles.

Cinco pruebas existentes fijaban el comportamiento antiguo. Se actualizaron
conservando lo que de verdad protegían —que **no se envíe correo**, que es lo que
decían sus nombres— y se renombraron, porque «RetornaFailure» ya no describe lo
que comprueban.

## API-07 · Horarios y feriados sin nombre — **CORREGIDO**

`BusinessScheduleController` no tiene ningún validador registrado. Las horas y la
máscara de días sí se comprobaban en el servicio; **el nombre no**.

- Un **feriado sin nombre** se aceptaba con 200: queda un día no laborable en
  blanco que alarga los plazos de SLA y que nadie puede explicar ni sabe si sobra.
- Un **horario sin nombre** devolvía 400… pero con el mensaje «Ya existe un
  horario con ese nombre», porque chocaba con otro vacío anterior. El primero se
  habría creado sin problema.

Ese segundo caso delató además una prueba mía que pasaba por casualidad: exigía
solo un 400 y lo recibía por el motivo equivocado. Ahora comprueba el mensaje.

## Cuatro reglas de negocio que solo vivían en el código

Ninguna estaba documentada ni cubierta. Las cuatro quedan fijadas:

1. **Una sola solicitud de cambio de plan pendiente por cliente.** Con dos, no
   habría forma de saber cuál gana al aprobarlas.
2. **Un downgrade NO se puede aplicar a mitad de mes**, ni pidiéndolo
   explícitamente con `midMonth=true`: regalaría el resto del mes ya cobrado. Un
   upgrade sí. *Esta la descubrí equivocándome*: mi prueba daba por hecho que
   `midMonth` se aplicaba siempre, y el sistema respondió que no, con razón.
3. **No se puede solicitar el cambio al plan que el cliente ya tiene.**
4. **El panel no admite ocultar todas las secciones**: una pantalla vacía no es
   una preferencia, es algo que el usuario no sabría deshacer.

---


# Cobertura

Dos preguntas distintas que conviene no mezclar: **cuántas líneas ejecutan las
suites unitarias**, y **cuánta API tocan las E2E**. La segunda no la mide
coverlet, porque las E2E golpean un contenedor sin instrumentar.

## Cobertura de líneas

| Servicio | Líneas | Ramas |
|---|---:|---:|
| Chatbot (jest) | **88,1 %** | 81,0 % |
| Notifier (pytest) | **72,4 %** | — |
| Backend (coverlet) | **48,3 %** | — |
| Frontend (vitest) | **39,5 %** | 72,1 % |

**El 48,3 % del backend salía antes como 42,0 %, y era falso.** `TelecomBoliviaNet.Tests`
—el proyecto **más grande**, con 925 de las 1.285 pruebas— no declaraba
`coverlet.collector`, así que la recolección generaba informes solo para los
otros dos y la cifra global salía muy por debajo de la real. Corregido: ahora los
tres proyectos reportan.

Merece la pena señalarlo porque el fallo no era ruidoso. La herramienta no avisa
de que le falta un proyecto: simplemente devuelve un número más bajo, que se
puede mirar durante meses sin sospechar nada.

**Por capas del backend:**

| Capa | Cobertura | Líneas |
|---|---:|---:|
| Domain | **83,4 %** | 1.202 |
| Infrastructure | 71,1 % | 7.309 |
| Presentation | 37,7 % | 2.269 |
| Application | **30,9 %** | 10.635 |

El reparto es el correcto en su forma: lo más cubierto es el **dominio**, que es
donde viven las reglas de negocio y donde se pusieron a propósito (E-04). Lo peor
cubierto es Application… **pero ese 30,9 % está subestimado y se puede demostrar.**

De los 202 archivos de Application, **85 figuran con cobertura cero** (3.158
líneas). Los mayores:

```
141  Tickets\Commands\ChangeTicketStatusCommand.cs
126  Tickets\Commands\CreateTicketCommand.cs
100  Clients\Commands\RegisterClientCommand.cs
 93  Installations\Commands\CreateInstallationCommand.cs
 76  Users\Commands\CreateUserCommand.cs
```

Son exactamente los manejadores que la suite E2E ejercita en cada ejecución
—crear tickets, registrar clientes, agendar instalaciones, crear usuarios—.
Aparecen a cero porque las E2E entran por HTTP a un contenedor que no lleva
instrumentación. La cobertura real de esa capa es más alta; lo que falta no es
prueba, es **medición**.

## Cobertura de la API por las E2E

Medida sobre el tráfico real de una ejecución completa, cruzando el log de acceso
de nginx contra el inventario de rutas de los controladores:

**231 de 231 endpoints — 100 %.**

Se partió de **146 (63 %)**. Los 85 que faltaban se cubrieron con cuatro módulos
nuevos —cambios de plan, horarios y feriados, catálogos y configuración, agenda de
instalaciones— y ampliando los doce existentes.

Así estaba antes: **nueve controladores no recibían una sola petición.**

| Sin ninguna prueba E2E | Endpoints |
|---|---:|
| `BusinessScheduleController` (horarios laborales) | 6 |
| `PlanChangeController` (cambios de plan) | 5 |
| `CannedResponsesController` | 4 |
| `ClientQrController` | 4 |
| `InstallationAgendaController` | 4 |
| `CompanyProfileController` · `AdminSettingsController` | 2 + 2 |
| `BotEventsController` · `InstallationTechniciansController` | 1 + 1 |

Y huecos parciales en los grandes: 16 de 32 en tickets, 9 de 20 en clientes.

De esa lista, **`PlanChangeController` era el que más incomodaba**: los cambios de
plan mueven el precio que se factura. Ahora tiene su propio módulo, y las dos
direcciones de la regla de 2026-07 están fijadas —incluida la que yo desconocía:
un downgrade **no** se puede forzar a mitad de mes—.

## Qué queda

La cobertura de API está cerrada. Quedan dos cosas, y ninguna es de superficie:

1. **Frontend, 39,5 %.** Es la capa peor cubierta y donde se concentra FE-01
   —errores tragados que se ven como «no hay datos»—; son justo los casos que una
   prueba de componente detecta barata.
2. **Instrumentar el contenedor** para medir lo que aportan las E2E. Hasta
   entonces, cualquier cifra de Application es un suelo, no una medida: sus
   archivos más «descubiertos» son precisamente los que las E2E ejercitan en cada
   ejecución.

---

# Lo que está bien, y no conviene romper

Esta pasada verificó cosas que podrían haberse dado por malas y no lo son. Vale la
pena dejarlas escritas para que nadie las «arregle»:

- **El token de acceso no se guarda en disco.** `partialize` lo excluye a
  propósito; vive en memoria y el refresco va por cookie. Es el patrón recomendado,
  está bien implementado y ahora hay una prueba que lo fija.
- **El token de refresco ROTA en cada uso** (`RefreshService.RotateAsync`), así
  que uno robado sirve una sola vez y su reutilización delata el robo. Lo
  descubrí porque las pruebas E2E fallaban: un `storageState` guardado solo vale
  para un arranque en frío. Es decir, **el sistema se comportó exactamente como
  debe y fue mi andamiaje el que tuvo que adaptarse** — que es la dirección
  correcta de esa negociación.
- **`InternalTokenGuard`** hashea a longitud fija **antes** de `timingSafeEqual`
  —evitando tanto la fuga por longitud como la excepción por buffers desiguales— y
  **falla cerrado** si no está configurado.
- **`AsNoTracking` sí se usa**, en la capa de repositorios, con comentario en los
  sitios donde se omite a propósito. Medido desde Application parecía faltar en 23
  de 26 archivos; leído, está bien resuelto donde toca.
- **Ni un `dangerouslySetInnerHTML`** en 189 archivos de React.
- **Ni un `async void`, ni un `.Result`/`.Wait()`** en todo el backend.
- **Los guards de ruta son consistentes** en las 20 rutas protegidas.
- **El limitador de tasa del chatbot falla cerrado**, y documenta la trampa del
  `INCR` que devuelve `null` —la que habría anulado la protección en silencio—.
- **El notifier** distingue sus excepciones (`RateLimitError`,
  `MetaApiUnavailableError`) en vez de capturar `Exception` a secas, y no registra
  secretos.

---

# Veredicto por dimensión

**Estado de las pruebas al cerrar esta pasada**, todas ejecutadas:

| Suite | Resultado |
|---|---|
| Backend C# (unit + tests + integración) | **1.285 verdes** (73 + 925 + 287) |
| Chatbot NestJS | **1.479 verdes** en 122 suites (5 nuevas, de SEG-01) |
| Frontend React (vitest) | **237 verdes** en 32 archivos |
| Notifier Python (pytest) | **220 verdes**, 72,38 % de cobertura |
| **E2E Playwright (nuevas)** | **587 verdes / 1 omitida** contra el stack en docker |

Se reparten en **17 módulos de API (576 casos)**, 5 recorridos por navegador y 5
contra el chatbot. La omitida es deliberada: el caso que comprueba que el login no
revela si una cuenta existe se autoexcluye cuando el limitador está activo, y ese
módulo corre al final justo porque tolera un 429.

| Dimensión | Estado | Matiz |
|---|---|---|
| **Seguridad** | Buena, con un agujero que era serio | SEG-01 permitía envíos salientes sin credencial. Corregido y probado. El resto —firma, guard interno, sin XSS, sin secretos— es sólido |
| **Corrección** | Fuerte | 3.221 pruebas verdes en los cuatro servicios, más las E2E |
| **Rendimiento** | Correcto | Sin sync-sobre-async; `AsNoTracking` donde toca; nada nuevo en esta pasada |
| **Escalabilidad** | Con una arista | DISP-01: el límite por IP no escala a una oficina con NAT |
| **Mantenibilidad** | Buena | Medianas de 100 y 69 líneas; sin archivos monstruo en el frontend |
| **SOLID** | Cumplido donde importa | ISP satisfecho por el consumidor (ARQ-01); la implementación sin partir es deuda menor |
| **Clean code** | Desigual | Comentarios excelentes —explican el porqué—; pero abstracciones sin usar y errores tragados |

---

# Qué haría, y en qué orden

1. **SEG-01 — hecho.** Falta desplegarlo. Es lo único de esta lista que expone
   algo hacia fuera.
2. **DISP-01 — decidir.** Requiere una decisión de negocio, no un commit. La
   pregunta concreta: ¿cuántas personas comparten la IP de la oficina?
3. **FE-01 — barato y con efecto directo.** Basta con que los `catch` vacíos de
   carga pongan un mensaje. El propio `ClientProfilePage` ya tiene el patrón.
4. **DEP-01 — comprobar con `npm audit`** antes de mover nada.
5. **CB-01 y FE-02 — borrar.** Código muerto, incluidas sus pruebas. Las de CB-01
   sobre todo, porque fijan rutas equivocadas.
6. **CB-02 — diez minutos**, en la misma ventana en que se despliegue.
7. **ARQ-01 — no lo haría ahora.** El beneficio ya está cobrado por las interfaces.

---

## Una observación sobre el conjunto

La pasada anterior cerró diciendo que el patrón recurrente era *la abstracción
correcta construida y luego no usada*. Esta pasada, en código completamente
distinto, encuentra lo mismo cuatro veces más: dos repositorios que nadie
registra, un formateador con cero importaciones frente a 39 formateos a mano, un
hook sin llamadores pero con pruebas, y una configuración de E2E apuntando a un
directorio vacío.

Pero SEG-01 y DISP-01 son de otra familia, y creo que es la observación más útil
de este informe: **ninguno de los dos está dentro de una clase.** Uno vive en el
orden entre un middleware y un controlador; el otro, en el encuentro entre una
partición por IP y una oficina con NAT. Un análisis clase por clase —el que se
pidió, y el que hice— los habría pasado por alto a los dos. Aparecieron al
**levantar el sistema y usarlo**: el primero enviando peticiones sin firma, el
segundo porque mis propias pruebas se estrangularon.

Es un argumento a favor de que estas pruebas E2E existan, más allá de las cuatro
que se escribieron.
