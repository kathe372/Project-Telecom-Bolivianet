# Análisis de código — TelecomBoliviaNet

**Fecha:** 2026-08-30 · **Estado del repositorio:** commit `3952baa`, 1231 tests verdes

---

## Cómo se hizo, y qué NO cubre

Dos pasadas. La primera **automática, sobre las 899 clases del backend**, para que
ninguna quedara sin mirar: tamaño, dependencias de constructor, superficie
pública, ramificación, uso de EF, escrituras, `catch`. La segunda, **lectura
directa** de las que la primera señaló y de las arquitectónicamente centrales.

Los scripts quedan en `scripts/analisis/` para que cualquier cifra de aquí se
pueda reproducir y discutir.

**Dos avisos sobre las cifras.** Ninguna métrica automática se usó como
conclusión: cada una se verificó leyendo la clase. Eso importó — el detector de
N+1 marcó 13 sitios y **9 eran falsos positivos** (bucles por tramos, guardados
después del bucle). Y las cifras cuentan líneas físicas, comentarios incluidos;
este proyecto comenta el porqué de cada decisión, así que engorda clases que por
lógica son cortas.

**Lo que no cubre:** el frontend React (219 archivos) solo se midió, no se leyó.
El notifier Python se revisó únicamente donde toca la base compartida. Del
chatbot se leyó la estructura y los puntos críticos, no sus 158 clases.

---

## Tamaño real

| Capa | Archivos | Líneas | Mediana por clase |
|---|---:|---:|---:|
| Domain | 92 | 3.759 | 18 |
| Application | 240 | 18.751 | 43 |
| Infrastructure | 113 | 7.843 | 29 |
| Presentation | 38 | 4.976 | 72 |
| **Backend total** | **483** | **35.329** | |
| Chatbot (NestJS) | 158 | 15.497 | |
| Notifier (Python) | 28 | 2.008 | |

**Las medianas son sanas.** Una mediana de 43 líneas en Application significa que
el grueso del código está bien troceado. Los problemas están en los extremos, no
en el cuerpo — que es la situación buena.

---

## Veredicto por dimensión

| Dimensión | Estado | Lo que lo sostiene |
|---|---|---|
| **Seguridad** | Fuerte | Firma del webhook con `timingSafeEqual`, cabeceras completas, sin inyección SQL, sin secretos versionados, libro mayor con guarda. Dos huecos acotados |
| **Corrección** | Fuerte | 1231 tests; 26 fallos encontrados y cerrados con prueba; reglas de negocio en el dominio y probadas por tabla |
| **Rendimiento** | Correcto | Sin sync-sobre-async; recorridos acotados por tramos; **un** N+1 real |
| **Mantenibilidad** | Buena, con un punto ciego | Convenciones escritas, 5 puertas en CI, ADRs. Pero la capa Presentation casi no se prueba |
| **SOLID** | Mejor de lo que dicen sus propias métricas | 15 de 16 clases "con demasiadas dependencias" son casos de uso enfocados. Una excepción real |
| **Escalabilidad** | Preparada, con una grieta | Los 11 jobs coordinan por advisory lock. Un generador se quedó fuera |
| **Clean code** | Desigual | Comentarios excelentes; nombres que prometen de más; 72 funciones > 50 líneas |

---

# Hallazgos

Ordenados por lo que costaría que salieran mal.

## S-01 · El bot se identifica por su dirección de correo — **CORREGIDO**

`TicketsController.cs:62`

```csharp
private async Task<bool> CanActOnTicketAsync(Guid ticketId)
{
    if (CurrentUserRole != "Tecnico") return true;

    var botEmail = _config["SISTEMA_BOT_EMAIL"] ?? "bot@telecombolivianet.bo";
    if (string.Equals(CurrentUserEmail, botEmail, StringComparison.OrdinalIgnoreCase))
        return true;
    ...
```

Esta comprobación decide, en **9 endpoints**, si quien llama puede tocar un
ticket. Y al chatbot lo reconoce **comparando su correo** contra una variable de
entorno con un valor por defecto escrito en el código.

Dos problemas encadenados:

1. **Un error de configuración quita acceso en silencio.** Si `SISTEMA_BOT_EMAIL`
   no está puesta en un entorno y el correo real del bot no coincide exactamente
   con el literal, el bot deja de poder actuar sobre tickets. No falla el
   arranque, no hay aviso: simplemente empieza a devolver "Ticket no encontrado"
   en conversaciones reales de clientes.
2. **F8.1 lo dejó obsoleto sin que se note.** Con el rol `Bot`, la primera línea
   (`CurrentUserRole != "Tecnico"`) ya devuelve `true` para el bot, así que el
   bloque del correo pasó a ser código muerto — pero código muerto que *parece*
   una regla de seguridad vigente.

**Corregido (2026-08-30).** La identificación vive ahora en
`Domain/Services/BotIdentity`, una sola vez, y **manda el rol**.

La comparación por correo sigue como **puente explícito y fechado**: el usuario que
ya existe en producción todavía tiene rol `Tecnico`, así que quitarla antes de
aplicar el `UPDATE` dejaría al chatbot sin acceso a tickets el mismo día del
despliegue. Está marcada para borrarse con ese paso, y limitada a `Tecnico` — si
alguien diera de alta a una persona con ese correo y otro rol, no heredaría nada.

El segundo sitio también cae: `UserRepository.GetPagedAsync` filtraba el listado de
usuarios comparando la misma cadena. Ahora usa `BotIdentity.NoEsElChatbot`, la forma
traducible a SQL de la misma regla, atada a la de memoria por una tabla de casos.

`TechnicianScopeIntegrationTests` lo fija por HTTP con un token de rol `Bot` y un
correo **deliberadamente distinto** del configurado: si alguien devolviera la
comparación por correo, ese test se pone rojo.

## S-02 · El generador de números se quedó fuera de la coordinación entre réplicas — **CORREGIDO**

`SequenceGenerator.cs:17`

```csharp
private static readonly SemaphoreSlim _resetLock = new(1, 1);
```

F2 puso a **los 11 jobs** a coordinarse entre réplicas con advisory locks de
PostgreSQL. Este generador —que reinicia la numeración de facturas al cambiar el
año— se quedó con un semáforo **local al proceso**, que no coordina nada entre
instancias.

El escenario: 1 de enero, dos réplicas conviviendo (un despliegue basta). Ambas
leen "último año = 2026", ambas pasan la doble comprobación, cada una toma *su
propio* semáforo, y ambas ejecutan `ALTER SEQUENCE ... RESTART WITH 1`.

**No es catastrófico, y conviene decirlo:** `InvoiceNumber` tiene índice único,
así que un número repetido revienta con violación de restricción en vez de emitir
dos facturas legales con el mismo número. El fallo es ruidoso. Pero es un fallo el
1 de enero, en el proceso de facturación, y por una causa que ya está resuelta a
tres archivos de distancia.

**Corregido (2026-08-30).** El reinicio va dentro de `JobLease.TryRunExclusiveAsync`
—la misma pieza que coordina los 11 jobs— con la clave `seq-reset:{configKey}`.

Si otra réplica tiene el lease, ésta **no** reinicia (correcto: ya lo está haciendo
la otra) y espera hasta 2 s a que publique el año antes de seguir. No se bloquea
indefinidamente: pasado el margen continúa, porque emitir un número del rango viejo
es molesto pero no rompe nada, mientras que colgar la facturación sí.

## E-01 · `TicketHelper` hace cinco cosas y su nombre no dice ninguna — **CORREGIDO**

`Tickets/Helpers/TicketHelper.cs` — 199 líneas, **9 dependencias, 7 miembros
públicos**.

Es la **única** clase del backend donde el exceso de dependencias corresponde de
verdad a un exceso de responsabilidades:

| Método | Responsabilidad |
|---|---|
| `LoadAsync` | acceso a datos |
| `BuildDetailAsync` | composición de DTO |
| `GetDueDateFromSlaAsync` | cálculo de vencimiento por SLA |
| `SendNotificationAsync` | notificación al cliente |
| `MapToListItem`, `MapSlaPlan` | mapeo estático |

Nada de eso tiene que ver entre sí, y "Helper" es precisamente el nombre que se le
pone a una clase cuando no se sabe qué es. Sus 9 dependencias son la suma de cinco
trabajos distintos, no el coste de uno complejo.

**Corregido (2026-08-30).** Partido en cuatro, y `TicketHelper` eliminado:

| Clase | Líneas | Deps | Públicos | Qué hace |
|---|---:|---:|---:|---|
| `TicketDetailBuilder` | 76 | 5 | 3 | carga el ticket y compone su ficha |
| `TicketAssignmentNotifier` | 81 | 2 | 2 | avisa por WhatsApp al técnico asignado |
| `TicketDueDateService` | 38 | 2 | 2 | cuándo vence, según el plan de SLA |
| `TicketMapper` | 28 | **0** | 3 | entidad → DTO, estático |

**Lo que de verdad cambió** no es un número, es quién pide qué. Antes
`CloseTicketCommand` recibía un cajón de 9 dependencias para hacer una sola cosa:
cargar un ticket. Ahora declara `TicketDetailBuilder` y nada más.
`GetTicketByIdQuery`, igual. `UpdateTicketCommand` pide dos. `AssignTicketCommand`,
otras dos. Cada caso de uso dice lo que usa.

**Y una cifra que NO mejoró, dicha tal cual:** las clases de Application con más
de 6 dependencias siguen siendo **16**, y `CreateTicketHandler` subió de 9 a **11**
—recibe tres colaboradores donde antes recibía uno—.

Es el mismo efecto que ya apareció en F5 con el recuento de archivos con EF:
**partir un cajón de sastre empeora la métrica mientras mejora el diseño**. Y
refuerza justo lo que dice E-02: el número de dependencias está midiendo lo que no
es. Para los handlers que quedan en 9–11, la respuesta no es seguir partiendo,
es sacar las transversales del constructor.

## E-02 · La regla de "máximo 6 dependencias" está midiendo lo que no es

Dieciséis clases de Application pasan de 6 dependencias. Al mirarlas una a una:

| | |
|---|---:|
| Clases con >6 dependencias | 16 |
| De ellas, con **2–4 miembros públicos** | **15** |

Es decir: **quince de dieciséis no son god-classes**. Son casos de uso enfocados
—`PaymentCreditService` tiene 11 dependencias y **un solo método público**— que
tocan muchos colaboradores porque el caso de uso realmente los toca.

Lo que sí revela la cifra es otra cosa:

| Dependencia transversal | Clases que la inyectan |
|---|---:|
| `AuditService` | **57** |
| `ILogger<T>` | 35 |
| `INotifPublisher` | 15 |
| `IUnitOfWork` | 11 |

Cincuenta y siete clases inyectan auditoría. Eso no es diseño: es una preocupación
transversal viajando por el constructor de medio sistema. Y **el pipeline de
MediatR ya existe y está enchufado** (`LoggingBehavior`), así que la pieza donde
debería vivir está construida y sin usar.

**Arreglo:** un `AuditBehavior` en el pipeline. Bajaría una dependencia a 57 clases
y dejaría la regla de las 6 midiendo lo que pretendía medir.

## E-03 · Dos mecanismos de validación conviviendo, aplicados de forma desigual — **CORREGIDO**

| | |
|---|---:|
| Endpoints que reciben `[FromBody]` | 35 |
| Validan con FluentValidation en el controlador | 11 |
| No validan en el controlador | **24** |

Los 24 **sí validan** —dentro del handler, con `if` sueltos: `ResetPasswordCommand`
tiene 6 comprobaciones, `CreateInstallationCommand` 4—. Así que no hay un agujero
de validación; hay **dos sistemas haciendo lo mismo en sitios distintos**, y solo
5 archivos de validadores para 35 endpoints.

El coste se ve en `TicketsController`: **8 de sus 12 dependencias son
`IValidator<T>`**, una por DTO, y el mismo bloque de dos líneas está copiado **17
veces** en los controladores:

```csharp
var v = await _createVal.ValidateAsync(dto);
if (!v.IsValid) return BadRequestResult(string.Join(" ", v.Errors.Select(e => e.ErrorMessage)));
```

Cada endpoint nuevo suma una dependencia al controlador y otra copia del bloque.

**Corregido (2026-08-30).** Un filtro de acción, `ValidacionDeCuerpoFilter`, que
resuelve el validador del argumento por reflexión desde el contenedor. **Sin añadir
ningún paquete.**

| | Antes | Ahora |
|---|---:|---:|
| Dependencias de `TicketsController` | 12 | **4** |
| `IValidator<T>` inyectados en controladores | 17 | **0** |
| Bloques `ValidateAsync` copiados | 17 | **0** |

No se eligió el `ValidationBehavior` de MediatR que proponía el hallazgo: los
validadores son de **DTOs** y el pipeline ve **comandos**, que los envuelven. Un
filtro de acción los ve tal cual llegan.

**Y arregla un fallo que apareció al hacerlo.** Había *dos* sobres de error:
`{ success, message }` en ocho endpoints y `{ success, errors: [...] }` en siete.
El frontend lee **solo `message`** (`extractApiError`, 29 usos), así que en esos
siete el usuario veía el texto genérico de reserva —"no se pudo guardar"— en lugar
del motivo real. Ahora hay un solo sobre, y es el que el frontend sabe leer.

`ValidacionDeCuerpoIntegrationTests` va por HTTP porque un filtro es justo lo que
no se ve llamando al handler. **Se comprobó que sirven**: al quitar el filtro del
registro se ponen rojos. Uno de ellos afina el detalle de que sin filtro
`[ApiController]` devuelve 400 igualmente por las anotaciones del DTO, pero con
`ProblemDetails` — sin `success` y sin `message`.

## M-01 · La lógica de autorización vive en el controlador y no la prueba nadie — **CORREGIDO**

| Capa | Archivos de test que la tocan |
|---|---:|
| Domain | 102 |
| Application | 74 |
| Infrastructure | 36 |
| **Presentation** | **2** |

Y de esos dos, uno se escribió en F8.1 y el otro comprueba cabeceras. **Solo 2
archivos ejercitan la API por HTTP.**

Eso sería tolerable si los controladores fueran una capa fina de traducción. No lo
son. `TicketsController` contiene:

```csharp
// Un técnico solo debe ver los tickets asignados a él — se fuerza el filtro
// por su propio id sin importar qué haya mandado el cliente
if (CurrentUserRole == "Tecnico") f.AssignedToId = CurrentUserId;
```

Es una **regla de autorización a nivel de dato** —impide que un técnico vea la
carga de trabajo de sus compañeros manipulando el query string— y no tiene ningún
test. Igual que `CanActOnTicketAsync`, que decide lo mismo en 9 endpoints.

**Corregido (2026-08-30).** `TechnicianScopeIntegrationTests`, 7 tests por HTTP que
cubren las dos reglas: qué ve un técnico y sobre qué puede actuar. Incluye el caso
que les da sentido —Ana pidiendo explícitamente `/api/tickets?assignedToId={id de
Beto}` y no recibiendo nada— y la contraprueba de que un administrador sí los ve
todos.

**Se comprobó que sirven.** Pasar a la primera no demuestra nada, así que se
desactivaron las dos reglas del controlador a propósito: **3 de los 7 se pusieron
rojos**. Luego se restauró.

## E-04 · Modelo anémico: las reglas existen, pero nada obliga a pasar por ellas

De ~30 entidades, **3 tienen comportamiento**: `DistributionBox` (6 métodos),
`Client` (4) y `BusinessSchedule` (2). El resto son bolsas de propiedades con
`set` público.

Hay que ser justo: **las reglas no están perdidas**. Viven en 21 clases de
`Domain/Services` —`OverduePolicy`, `ProrationCalculator`, `WorkingDays`,
`SlotWindow`, `PaymentVoidPolicy`…— puras y probadas por tabla. Es un estilo
legítimo, y en este proyecto está bien ejecutado.

El coste es que **nada obliga a consultarlas**:

| Escritura directa de estado | Sitios | Regla que debería decidirlo | Usos de la regla |
|---|---:|---|---:|
| `Invoice.Status = …` | 8 | `InvoiceDomainService.CalculateStatus` | 3 |
| `SupportTicket.Status = …` | 13 | — | — |
| `Installation.Status = …` | 7 | — | — |

Ocho sitios asignan el estado de una factura; tres consultan la regla que lo
calcula. Nada impide dejar una factura en `Pagada` con `AmountPaid = 0` — que es
exactamente **D-17**, ya corregido una vez, y que puede volver por cualquiera de
los otros cinco sitios.

**Arreglo proporcionado** (no reescribir el dominio): métodos de transición en las
tres entidades que más duelen —`Invoice.Saldar()`, `Ticket.Cerrar()`,
`Installation.Cancelar()`— y `private set` en esos campos concretos. El compilador
pasa a ser quien obliga.

## P-01 · El dashboard hace una consulta por mes para dibujar una gráfica — **CORREGIDO**

`DashboardReadHandlers.cs:100`

```csharp
for (int i = q.Meses - 1; i >= 0; i--)
{
    ...
    var p = await _db.Payments.Where(x => !x.IsVoided && x.PaidAt >= ini && x.PaidAt < fin)
        .GroupBy(_ => 1).Select(...).FirstOrDefaultAsync(ct);
}
```

Doce meses son **doce viajes a la base** para una sola gráfica de la pantalla que
más se abre. Es el único N+1 real que quedó en pie tras verificar los 13
candidatos que marcó el detector.

**Corregido (2026-08-30).** Una sola consulta agrupada, y los meses sin cobros se
rellenan en memoria.

El detalle que importa: se agrupa por el mes **boliviano**, restando las 4 horas
antes de leer año y mes. Un cobro de las 21:00 del día 31 ya es día 1 del mes
siguiente en UTC, así que un `GroupBy` ingenuo lo habría contado en el mes
equivocado — y la gráfica se habría seguido dibujando sin que nadie lo notara.

`CollectionsTrendIntegrationTests` va contra PostgreSQL de verdad porque es lo único
que demuestra las dos cosas que un test en memoria no ve: que EF traduce
`PaidAt.AddHours(-4).Month` a SQL, y que el borde de mes cae donde debe.

## E-05 · El chatbot: 24 dependencias y un método de 348 líneas

`bot-orchestrator.service.ts` — 664 líneas, **24 dependencias inyectadas**, y
`processCoreLogic` ocupa de la línea 219 a la 567.

Es el mismo patrón que E-03, y con la misma ironía: **la abstracción correcta ya
está ahí**. El constructor recibe `pipeline: MessageHandler[]` — existe una tubería
de handlers — pero el núcleo de la conversación no pasó por ella.

**Arreglo:** mover los tramos de `processCoreLogic` a handlers de esa tubería, uno
por decisión (audio, menú, elección de cuenta, procedimiento, CSAT). No es un
rediseño: es terminar el que ya se empezó.

## S-03 · Un `#pragma` que apaga el aviso de inyección SQL — **CORREGIDO**

`SequenceGenerator.cs:21`

```csharp
#pragma warning disable EF1002
await _db.Database.ExecuteSqlRawAsync(
    $"CREATE SEQUENCE IF NOT EXISTS \"{seqName}\" START 1 INCREMENT 1");
```

**Hoy no hay inyección:** `seqName` sale siempre de literales
(`"invoice_number_seq"`, `"invoice_extra_seq"`). Lo que se pierde es el aviso:
quien mañana quiera generar secuencias por sucursal y pase un nombre desde fuera no
encontrará ninguna alarma, porque está apagada.

**Corregido (2026-08-30), y el hallazgo estaba mal planteado.** La guarda **ya
existía**: `ValidateSequenceName` es una lista blanca de cuatro nombres, más estricta
que la expresión regular que yo proponía. Lo que fallaba es que solo se aplicaba en
`NextVal`.

`ResetIfYearChangedAsync` corre **antes** que `NextVal` y ejecutaba `CREATE SEQUENCE`
y `ALTER SEQUENCE` sin pasar por ella. Ahora la lista blanca se aplica en las tres
rutas. No hacía falta inventar una guarda nueva: hacía falta usar la que había en
todas partes.

## C-01 · Nombres que prometen más de lo que hay

- `PaymentService` (195 líneas, 10 dependencias) tiene **un** método público:
  `VoidPaymentAsync`. No es "el servicio de pagos": es "anular un pago".
- `PaymentCreditService` (229 líneas): **un** método,
  `RegisterPaymentWithCreditAsync`.
- `TicketHelper`: ver E-01.

Son restos de F5, que partió las clases grandes correctamente pero conservó los
nombres de las originales. Quien busque dónde se registra un cobro abrirá
`PaymentService` y no lo encontrará.

## C-02 · 72 funciones de más de 50 líneas

La regla 3 de `CONVENCIONES.md` dice que ninguna función pasa de 50 líneas. Hay
**72** que sí. Las mayores: `AddServices` (172), `RegisterPaymentWithCreditAsync`
(155), `VoidPaymentAsync` (153), `GenerateMonthlyInvoicesAsync` (143).

Ya hay un trinquete en el CI (`scripts/funciones-largas.py`) que impide que suban.
Bajarlas es trabajo aparte, con su propio riesgo, y no se hace de pasada.

---

# Lo que está bien, y conviene no romper

Un análisis que solo lista defectos miente por omisión.

**La verificación del webhook de Meta** (`whatsapp-webhook.controller.ts`) está como
debe: falla cerrado si falta el secreto, exige la firma, y compara con
`timingSafeEqual` tras igualar longitudes. No es lo habitual encontrarlo bien.

**La coordinación entre réplicas.** Los 11 jobs pasan por
`JobLease.TryRunExclusiveAsync`, con advisory locks que se liberan solos si el
contenedor muere. El ADR-002 explica por qué no hacía falta Hangfire. Es la clase
de decisión que suele quedarse sin escribir.

**El libro mayor de crédito.** `CreditLedgerService` es el único escritor de
`CreditBalance` y lanza excepción antes de dejar un saldo negativo. Los tres "otros
sitios" que aparecieron escribiendo ese campo resultaron ser el JSON de auditoría.
La invariante se sostiene.

**Las reglas de negocio como política pura.** 21 clases en `Domain/Services`, sin
dependencias, probadas por tabla. `OverduePolicy` incluso lleva sus dos formas
irreductibles —una en memoria, otra traducible a SQL— atadas por un test que exige
el mismo veredicto de ambas.

**Higiene básica, medida y limpia:** cero `sync` sobre `async`, cero `DateTime.Now`
mal usado, cero `catch` vacíos, cero secretos versionados, cero interpolación de
entrada de usuario en SQL.

**Los comentarios.** Explican *por qué*, con el fallo concreto que motivó cada
decisión. Es lo mejor del repositorio y lo que más caro sería perder en un
renombrado masivo.

---

# Qué haría, y en qué orden

| # | Hallazgo | Estado | Esfuerzo |
|---|---|---|---|
| 1 | **S-01** rol en vez de correo | ✅ **hecho** | 15 min |
| 2 | **S-02** advisory lock en el generador (+ **S-03**) | ✅ **hecho** | 30 min |
| 3 | **M-01** tests HTTP de los roles humanos | ✅ **hecho** | medio día |
| 4 | **P-01** el N+1 del dashboard | ✅ **hecho** | 1 hora |
| 5 | **E-03** validación en un filtro | ✅ **hecho** | medio día |
| 6 | **E-01** partir `TicketHelper` | ✅ **hecho** | medio día |
| 7 | **E-02** `AuditBehavior` | Toca 57 clases: hacerlo con el resto en verde | 1 día |
| 8 | **E-04** transiciones en 3 entidades | Cierra la puerta por la que volvería D-17 | 1 día |
| 9 | **E-05** el orquestador del chatbot | Mayor radio; termina una tubería ya empezada | 2-3 días |

Los ocho primeros son del backend y **no dependen de desplegar**. El noveno toca el
chatbot.

---

## Una observación sobre el conjunto

El patrón que más se repite no es un defecto de diseño: es **la abstracción
correcta construida y luego no usada**.

El pipeline de MediatR existe y lleva solo el logging, mientras la validación se
copia 17 veces y la auditoría viaja por 57 constructores. La tubería de handlers
del chatbot existe y el núcleo de la conversación la esquiva con 348 líneas. Las
reglas de dominio existen en 21 políticas puras y el estado se asigna a mano en 28
sitios sin consultarlas.

No hace falta introducir nada nuevo para arreglar la mayor parte de esta lista.
Hace falta **usar lo que ya está**.
