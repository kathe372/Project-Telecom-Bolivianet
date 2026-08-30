# Bugs y deuda descubiertos durante el plan de mejora técnica

Regla de la Fase 0: **si al escribir un test se descubre un bug, NO se arregla ahí.**
Se anota aquí y se congela el comportamiento actual. Arreglar bugs y refactorizar a
la vez es cómo se rompen los sistemas en producción.

---

## Pendientes arrastrados

### 🟠 P-01 · F1: interfaces CERRADAS, despliegue aún pendiente

**a) Interfaces — RESUELTO el 2026-08-23.** De 7 a **12 de 24**, superando el
objetivo de 10 que fijaba el plan. Añadidas en este tramo:

```
IBusinessScheduleService · IClientQrService · IInvoiceOperationsService
IClientHistoryService    · IInstallationPhotoService
```

Quedan 8 servicios que los controladores inyectan como clase concreta:

```
AuditService · AuthService · CompanyQrService · NotifConfigService
NotifHistoryService · NotifSendService · TicketAttachmentService
TicketBalancingService
```

De ellos, los cuatro de notificaciones (`NotifConfigService` tiene **16 métodos
públicos**) **no** deberían recibir interfaz tal cual: sería consagrar el
problema en vez de resolverlo. Su sitio es **F5**, donde se parten.

`AuditService` merece mención aparte: lo inyectan servicios de toda la aplicación,
así que su radio de impacto es mucho mayor que el de los demás. Conviene hacerlo
en su propio PR.

> El test `DependencyResolutionTests` volvió a ganarse el sueldo: al cambiar estas
> cinco detectó que se habían actualizado los CAMPOS de cuatro controladores pero
> no los PARÁMETROS de sus constructores, que seguían pidiendo la clase concreta ya
> no registrada. Es un fallo que no rompe la compilación y solo aparece al abrir
> la pantalla afectada.

**b) Nada se ha desplegado a Railway desde que empezó el plan.** F0 y F1 están solo
en CI. Importa especialmente porque F1 tocó el registro de dependencias, que falla
**en runtime, no al compilar**.

Punto ciego conocido: `DependencyResolutionTests` cubre los controladores pero **no
los 11 hosted services**, que desde el arreglo de D-03 ya no arrancan durante los
tests. Al desplegar hay que **revisar los logs de arranque** buscando fallos de
resolución en los jobs.

Además sigue pendiente ejecutar `docs/sql/F0-registrar-migraciones.sql` en
producción. Las migraciones son idempotentes, así que el deploy no debería
romperse, pero conviene correrlo antes para que EF ni las intente.

---

## F4 — Fase 4 (2026-08-25)

### 🟡 D-18 · `SpecificRepoMock` consultaba una lista distinta de la que muta `AddAsync` — **CORREGIDO**

Infraestructura de tests, no código de producción. Introducido en los primeros
tramos de F4 y latente hasta el tramo de Tickets.

`RepoMock.Of<TRepo, T>(params T[] items)` guardaba los elementos en su propia
`List<T>`, y `AddAsync` añadía ahí. `SpecificRepoMock` hacía además su
`items.ToList()` para resolver los métodos con nombre de negocio — **otra lista**.
Efecto: un test que creaba una entidad y luego la leía por un método específico no
la encontraba.

Se manifestó al pasar `CreateTicketHandler` por `GetDetailAsync`: 16 tests en rojo
con "Ticket no encontrado" y `NullReferenceException`, ninguno por culpa del código
que probaban.

**Por qué importa más de lo que parece:** un mock que miente en esa dirección
produce fallos que apuntan al sitio equivocado. Se perdió tiempo mirando
`CreateTicketHandler` antes de sospechar del andamiaje.

**Arreglo:** `RepoMock.Of<TRepo, T>(List<T> list)` acepta la lista desde fuera y
ambas mitades comparten la misma instancia.

### 🟡 D-19 · `ClearDefaultFlagAsync` con llaves ausentes — **CORREGIDO**

En `BusinessScheduleService`:

```csharp
if (current.Count > 0)
    _scheduleRepo.UpdateRange(current);
    await _scheduleRepo.SaveChangesAsync();   // ← fuera del if, pese a la sangría
```

El `SaveChangesAsync` se ejecutaba siempre. Sin consecuencia funcional —guardar sin
cambios pendientes no hace nada—, pero la sangría afirma lo contrario de lo que el
código hace, que es la clase de trampa que produce el bug siguiente.

Reescrito con salida temprana: `if (current.Count == 0) return;`.

---

## F5 — Fase 5 (2026-08-26)

### 🟠 D-20 · `PaymentQueryService`: una copia obsoleta, registrada y con dos bugs ya corregidos — **ELIMINADA**

Estaba en el repositorio desde el commit inicial. 181 líneas que duplicaban cuatro
métodos de `PaymentService`, registrada en el contenedor
(`services.AddScoped<IPaymentQueryService, …>`) y **consumida por nadie**: ni el
controlador, ni otro servicio, ni un test.

Lo grave no es la duplicación, es **qué versión duplicaba**. Los dos informes de
recaudación de `PaymentService` se habían corregido para agregar los totales en
SQL sobre el rango completo; la copia se quedó con la versión anterior:

```csharp
// PaymentService (vigente): total sobre TODAS las filas del rango
var totals = await baseQuery.GroupBy(_ => 1).Select(g => new { Total = g.Sum(...) })...

// PaymentQueryService (copia): total sobre las filas que se trajeron a memoria
var payments = await query.OrderByDescending(p => p.PaidAt).ToListAsync();
...  payments.Sum(p => p.Amount), payments.Count
```

`GetCollectionByOperatorAsync` además deducía el nombre del operador de
`payments.FirstOrDefault()?.RegisteredBy?.FullName` en vez de buscarlo en la lista
de operadores.

**Por qué era una mina y no solo código muerto:** al estar registrada, bastaba con
que alguien inyectara `IPaymentQueryService` —el nombre más natural del mundo para
"consultas de pagos"— para reintroducir en silencio un bug de totales incorrectos
que ya se había arreglado.

**Qué se hizo:** se eliminaron la clase y su interfaz, y la extracción de F5 se
rehízo desde el código vigente. El nombre `PaymentQueryService` se reutiliza a
propósito: es el correcto, y ahora contiene lo correcto.

**Lección:** una extracción a medias que nadie termina de cablear no es neutra.
Envejece por separado del original y se convierte en una trampa con nombre
atractivo.

### 🟠 OBS-01 · El aviso del cambio de plan quedaba fuera de su transacción — **RECHAZO CORREGIDO**

Los cuatro `catch (Exception)` de `PlanChangeService` se revisaron uno por uno al
partir la clase, como pedía el plan. Tres hacen `rollback` y relanzan. El cuarto
—el aviso de aprobación— traga el error. El de rechazo no lo tragaba, y esa
asimetría fue lo que hizo mirar el sitio con calma.

**El hallazgo no era el `catch`.** `INotifPublisher.PublishAsync` no llama a
WhatsApp: inserta una fila en `NotifOutbox`, con FK a `Clients`, y hace su propio
`SaveChangesAsync`. Es una escritura local. Y estaba **después** del `CommitAsync`:

```
BeginTransaction → rechaza, cierra ticket → Commit → PublishAsync → Audit
                                              ↑         ↑
                                    negocio confirmado  |
                                              insert del outbox SIN protección
```

El patrón outbox existe justamente para que el cambio de negocio y el mensaje se
guarden en la misma transacción. Fuera de ella, si el insert falla:

1. el rechazo ya está guardado;
2. **el mensaje se pierde para siempre** — el worker solo entrega lo que llegó a
   escribirse, así que no hay reintento posible;
3. la excepción se lleva por delante el asiento de auditoría de más abajo, y
   queda un rechazo aplicado sin rastro de quién lo hizo.

Envolverlo en un `try/catch` habría arreglado (3) y consolidado (2): el mensaje se
perdería igual, pero en silencio.

**Corregido (2026-08-27):** en `RejectChangeAsync` el aviso pasa a estar **dentro
de la transacción**, antes del commit. O se rechaza y se encola el aviso, o no
ocurre ninguna de las dos cosas; si falla, el operador ve un error honesto y
reintenta. La auditoría queda fuera, que es la convención del resto del código.

Cubierto por dos tests que fallan sin el arreglo:
`RechazarCambio_SiElOutboxFalla_DeshaceTodoYNoConfirma` y
`RechazarCambio_ElAvisoSeEncolaAntesDeConfirmar`.

**Pendiente — la aprobación.** Ahí no se puede copiar tal cual:
`NotifyApprovedAsync` intenta primero `SendPlanChangeConfirmationAsync`, que **sí
es una llamada HTTP** al bot y no puede vivir dentro de una transacción. Cerrarlo
requiere partir el método en dos —el outbox dentro, el intento por HTTP fuera y
best-effort—, que es un cambio mayor y con su propio riesgo. Queda documentado en
el `<summary>` de `PlanChangeNotifier`.

### 🟡 OBS-02 · El proxy del chatbot no distingue "el bot dijo que no" de "el bot no responde" — **CORREGIDO**

Los once `catch (Exception)` de `BotProxyService` se revisaron al partir la clase
(F5). Todos hacen lo mismo y por una razón buena: el chatbot es un servicio
aparte que puede estar caído o desplegándose, y que lo esté no debe tumbar el
panel de administración entero.

El problema es lo que esa política **colapsa** en las operaciones que devuelven
`bool` —tomar una conversación, devolverla, borrar un documento del RAG, mandar
un mensaje—:

```csharp
catch (Exception ex) { _log.LogWarning(ex, "..."); return false; }
```

`false` significa a la vez *"el bot rechazó la operación"* y *"no se pudo hablar
con el bot"*. El operador ve el mismo mensaje en los dos casos y no sabe si tiene
sentido reintentar. En las lecturas pasa lo análogo: una lista vacía es
indistinguible de "no hay conversaciones".

**Corregido (2026-08-29).** Fue **una** edición, como estaba previsto, porque la
política ya vivía en un solo sitio.

Las seis operaciones que **cambian algo** —tomar y devolver una conversación,
mandar un mensaje, borrar un documento del RAG, confirmar una instalación,
invalidar una identidad— devuelven ahora `BotResult` con tres salidas: `Hecho`,
`Rechazado` y `NoResponde`. Las **lecturas** siguen igual: una lista vacía se
dibuja igual de bien que una llena, y ése era el motivo bueno de tragar.

Lo que ve el operador:

| Antes | Ahora |
|---|---|
| 502 "Error al tomar la conversación." | **502** "No se pudo tomar la conversación. Puede que ya la tenga otro agente." |
| 502 "Error al tomar la conversación." | **503** "El chatbot no está respondiendo, así que la operación no llegó a intentarse. Vuelve a intentarlo en un momento." + `Retry-After: 30` |

Las dos líneas de arriba eran **la misma respuesta**. Ahora la primera dice que
insistir no sirve y la segunda que sí.

**El frontend no hace falta tocarlo:** la forma del cuerpo sigue siendo
`{ error, code }`, así que el panel muestra el texto nuevo sin cambiar nada. Si
algún día quiere tratar el 503 distinto —un botón de reintentar—, ya tiene con
qué distinguirlo.

`BotResult` conserva una conversión implícita a `bool` para los avisos accesorios
dentro de un comando (invalidar la identidad al cambiar un teléfono), que solo
quieren saber si salió y no deben complicarse.

Fijado en `BotOutcomeTests`, incluido que una caída del chatbot **sigue sin
tumbar el panel**, que es la propiedad que no se podía perder.

### 🟠 D-22 · El botón "Anular" aparecía en casos distintos según la pantalla — **CORREGIDO**

La regla de si un cobro se puede anular estaba escrita **tres veces y de dos
maneras distintas**:

| Dónde | Plazo | ¿Mira si ya está anulado? |
|---|---|---|
| `PaymentService.VoidPaymentAsync` (la validación real) | constante | — (lo comprueba aparte) |
| `PaymentQueryService.GetByIdAsync` (ficha del pago) | constante | **NO** |
| `ClientProjectionHelpers.MapPaymentDto` (grilla de la ficha del cliente) | **`30` literal** | sí |

Dos fallos distintos en la misma regla:

1. **El literal.** Es exactamente el fallo que ya se había detectado y corregido
   en la ficha del pago —el comentario que lo explica sigue ahí— y que aquí se
   quedó sin tocar. Si alguien baja `VoidPaymentWindowDays` a 15, esta grilla
   sigue ofreciendo "Anular" durante 30 días y el backend lo rechaza.

2. **La divergencia de criterio.** La ficha del pago da `CanVoid = true` para un
   cobro **ya anulado** que siga dentro del plazo; la grilla no. La misma acción
   aparece o no según por dónde llegue el operador.

**Arreglo:** `PaymentVoidPolicy` en el dominio, con el plazo y la regla completa.
Expone `CanVoid` y `IsWithinWindow` por separado, porque el backend distingue
"fuera de plazo" de "ya estaba anulado" en su mensaje y son dos cosas distintas
que decirle al operador. `AppConstants.Security.VoidPaymentWindowDays` se conserva
delegando en la constante del dominio, para no romper lo que la referenciaba.

### 🟡 D-23 · El semáforo de SLA etiquetaba tickets que luego descartaba — **CORREGIDO**

En `GetSlaAlertsQuery`, la etiqueta que se guardaba en el DTO y el reparto en
listas usaban umbrales distintos:

```csharp
// etiqueta: todo lo que baje de 75 es "Attention"
pct >= 100 ? "Breached" : pct >= 75 ? "Warning" : "Attention"

// reparto: solo se recoge desde 50
if      (pct >= 100) breached.Add(item);
else if (pct >= 75)  warning.Add(item);
else if (pct >= 50)  attention.Add(item);
```

Un ticket al 30 % recibía etiqueta `"Attention"` y acto seguido se descartaba sin
entrar en ninguna lista. Sin consecuencia visible —el item no sale— pero el código
afirmaba una clasificación de tres tramos donde en realidad hay cuatro.

**Arreglo:** `SlaTrafficLight` en el dominio, con los umbrales nombrados y un
`SlaLevel` del que salen tanto la etiqueta como el cubo, así que no pueden
discrepar. De paso quedó escrito qué pasa cuando el vencimiento no es posterior a
la creación: se cuenta como vencido, que es lo que ya hacía.

### 🔴 D-21 · Un horario 24x7 dejaba el calendario de instalaciones sin un solo hueco — **CORREGIDO**

Salió al llevar la máscara de días laborables al dominio. `Is24x7` significaba
cosas distintas según quién preguntara:

| Quién | Qué hacía con un horario 24x7 |
|---|---|
| Cálculo de SLA (`TicketHelper`) | Lo trata aparte y **nunca consulta** la máscara ni las horas |
| Consulta de huecos de instalación | Leía la máscara y las horas **como si fuera un horario normal** |
| Consulta de huecos de visita | Igual |
| `ValidateDto` al crear/editar | **No comprueba nada** cuando `Is24x7` es `true` |

Ese último es el que cierra el círculo. `CreateBusinessScheduleDto` es un record
posicional de enteros: los campos que el JSON no traiga llegan como `0`. Así que
esto se guarda sin una queja:

```json
{ "name": "24/7", "timeZoneName": "America/La_Paz", "is24x7": true, "isDefault": true }
```

→ `WorkingDaysMask = 0`, `StartHour = 0`, `EndHour = 0`.

**Consecuencia:** el SLA sigue calculando bien —se salta el horario— y el
calendario de instalaciones **devuelve cero huecos todos los días, para siempre**,
sin ningún error a la vista. El operador ve una agenda vacía y no hay nada en los
logs que lo explique.

**Arreglo:** la entidad decide qué significa 24x7, en un solo sitio.
`IsWorkingDay` devuelve `true` para cualquier día si `Is24x7`, y el nuevo
`OpenHours` devuelve `(0, 24)` en vez de las horas guardadas. Las dos consultas
de huecos usan `OpenHours`.

Comprobado que no afecta al SLA: `AddBusinessMinutes` tiene un único llamador
—`TicketHelper`— y sale antes con `if (schedule is null || schedule.Is24x7)`, así
que `SlaCalculator` nunca ve un horario 24x7.

Cubierto por `BusinessSchedule24x7Tests`, verificados fallando sin el arreglo.

**Segunda pasada (2026-08-27) — el arreglo anterior era incompleto.**

Dejar que `IsWorkingDay` y `OpenHours` interpretaran bien un 24x7 mal guardado
quitaba el síntoma pero **dejaba la mentira en la base**. Yo mismo lo anoté como
riesgo aceptado: "si alguien desmarca la casilla, esos ceros pasarían a ser
efectivos". Eso no es un riesgo aceptable, es el mismo bug esperando.

Al mirarlo de nuevo apareció además un fallo distinto en `UpdateAsync`:

```csharp
schedule.Name = ...;  schedule.StartHour = ...;  schedule.Is24x7 = ...;   // muta
if (dto.IsDefault == true) { await ClearDefaultFlagAsync(); }             // ¡GUARDA!
var validation = ValidateDto(...);                                        // valida
if (validation is not null) return Failure(validation);                   // sin deshacer
```

`ClearDefaultFlagAsync` llama a `SaveChangesAsync`. Como la entidad ya está
mutada y rastreada, **ese guardado persiste los valores inválidos** y acto seguido
la respuesta dice que la operación falló. Una petición con `isDefault: true` y
horas inválidas dejaba el horario roto e informaba de error.

**Lo que se hizo ahora:**

1. `BusinessSchedule.NormalizeSchedule()` — un 24x7 se **guarda** como los siete
   días de 0 a 24. El dato deja de ser mentira, y desmarcar la casilla deja un
   horario válido que el operador puede ajustar, en vez de uno muerto.
2. `CreateAsync` y `UpdateAsync` normalizan antes de persistir.
3. `UpdateAsync` **valida antes de tocar la entidad**: se calculan los valores
   pretendidos, se validan, y solo entonces se asignan.
4. Eliminado el `SaveChangesAsync` duplicado del final.

**Tercera pasada — el test de extremo a extremo encontró lo que faltaba.**

Las dos pasadas anteriores probaban la ENTIDAD. Ninguna probaba lo que le importa
al operador: que al marcar "24x7" el calendario siga ofreciendo citas. Al
escribir ese test —crear el horario como lo crea la pantalla y pedir los huecos—
apareció un tercer fallo, **peor que el original**:

```
System.ArgumentOutOfRangeException : Hour, Minute, and Second parameters
describe an un-representable DateTime.
   at SlotTimeGenerator.Generate(...)
```

`OpenHours` devuelve `(0, 24)` para un 24x7, y el generador hacía
`new TimeOnly(endHour, 0)`. **`TimeOnly` llega a las 23:59**, así que las 24 la
revientan: la consulta de huecos pasó de devolver una lista vacía en silencio a
morir con un 500. Mi propio arreglo introdujo eso.

Del mismo origen había un segundo problema latente: `AddMinutes` sobre `TimeOnly`
**da la vuelta al reloj**. Un slot que se pasara de medianoche volvía a las 00:30
y seguía pareciendo anterior al cierre, así que el bucle no paraba donde debía.

`SlotTimeGenerator` calcula ahora en **minutos desde medianoche**, no con
`TimeOnly`.

**Límite asumido y escrito:** no se ofrece un slot que termine exactamente a
medianoche. No es representable, y el cálculo de capacidad —que construye
`fecha + horaFin`— tomaría las 00:00 como un instante ANTERIOR al inicio y
contaría mal. Con 24x7 y visitas de dos horas, la última franja es 20:00–22:00.
Ofrecer instalaciones de 22:00 a medianoche no es un caso real de este negocio;
un 500 sí lo era.

**Migración `20260827000001_NormalizeTwentyFourSevenSchedules`** — normaliza las
filas que YA están mal en producción. Idempotente y acotada: solo toca
`Is24x7 = true` cuyos valores no sean ya los correctos.

`IsWorkingDay` y `OpenHours` se quedan como red para las filas mal guardadas que
existan antes de aplicar la migración.

**Cobertura final:** 7 tests de dominio (entidad y normalización), 4 de
integración de extremo a extremo (crear desde la pantalla → la agenda tiene
huecos; el dato se guarda normalizado; un horario normal no abre el domingo;
desmarcar 24x7 no mata el calendario) y 4 del generador en el borde de la
medianoche.

### 🟡 OBS-03 · Un segmento con el operador equivocado no alcanza a nadie y no lo dice — **CORREGIDO**

Los operadores de las condiciones de segmento son **asimétricos**: sobre números
valen seis (`=`, `!=`, `>`, `<`, `>=`, `<=`); sobre texto solo dos (`=`, `!=`).

Un segmento con `zona > "Norte"` es sintácticamente aceptable, se guarda sin
protestar, y al evaluarlo **no alcanza a ningún cliente**. Lo mismo con un
`=>` tecleado al revés, o con un valor no numérico en `deuda` —ahí entra el
`catch { return false; }` de `EvaluaCondicion`, deliberado porque se evalúa por
cliente en bucle caliente.

El comportamiento es **seguro**: mejor no escribirle a nadie que a todos. El
problema es que es **silencioso**, y quien armó el segmento no tiene forma de
distinguir "mi regla está mal escrita" de "no hay clientes que cumplan".

**Corregido (2026-08-29): se avisa al guardar**, que es cuando se puede
corregir. `SegmentRules.Problemas(campo, operador, valor)` cubre las tres formas
de equivocarse, y `NotifSegmentService` lo llama al crear y al actualizar:

- **campo que no existe** — y se dice cuáles sí: `zona, plan, estado, deuda, dias_mora`;
- **operador que ese campo no entiende** — `zona > "Norte"` responde que *zona es
  texto y solo admite = y !=; compararlo con mayor o menor no alcanzaría a
  nadie*, y el `=>` tecleado al revés también cae aquí;
- **valor no numérico en un campo numérico** — `deuda > "mucho"`.

El comportamiento en tiempo de evaluación **no cambia**: sigue siendo `false`
silencioso, que es lo seguro para un bucle caliente que decide a quién se le
manda un WhatsApp. Lo que cambia es que ahora una regla mal escrita no llega a
guardarse.

**Un detalle que apareció al hacerlo:** el catálogo de campos y el `switch` de
`NotifShared.EvaluaCondicion` son dos sitios que no se pueden unificar —uno es
una lista, el otro un `switch` sobre entidades cargadas—. Van atados por un test
que compara ambos, escrito a mano a propósito para que no se valide a sí mismo.
Si alguien añade un campo a uno y no al otro, se pone rojo.

---

## Caza de bugs (2026-08-24)

Barrido dirigido tras F0–F4, con sondas escritas para intentar **romper** el
sistema, no para confirmar que funciona. 25 pruebas nuevas: 18 de casos límite en
el dominio puro, 5 del invariante contable del crédito y 2 de concurrencia.

Resultado: **un bug real confirmado (D-14)** y tres observaciones menores. El resto
del código aguantó todo lo que le tiré.

### 🔴 D-14 · `Invoice` sin token de concurrencia — **CORREGIDO (2026-08-24)**

**Demostrado**, no supuesto:
`Probes/ConcurrencyProbeTests` (el test se invirtió al corregirlo).

`Client` declara `Xmin` como `IsRowVersion()` (AppDbContext:189). **`Invoice` no**,
pese a que el historial del proyecto (FIX-06) afirma que el token se aplicó a
«Client + Invoice». La entidad `Invoice` ni siquiera declara la propiedad.

**El escenario:** dos cajeros cobran la misma factura de Bs. 100 a la vez.

```
Cajero A carga la factura   -> AmountPaid = 0
Cajero B carga la factura   -> AmountPaid = 0     (aún no guardó nadie)
A guarda                    -> AmountPaid = 100, Pagada
B guarda                    -> AmountPaid = 100, Pagada   <- pisa a A, SIN AVISAR
```

Quedan **dos pagos registrados** y **dos filas en `PaymentInvoices`**, pero la
factura dice haberse cobrado una sola vez. El cliente pagó doble y la conciliación
no cuadra.

**Por qué la transacción no lo evita:** `RegisterPaymentWithCreditAsync` envuelve
todo en `IUnitOfWork`, pero PostgreSQL usa READ COMMITTED por defecto. Ambas
transacciones LEEN antes de que ninguna ESCRIBA, así que ninguna ve el cambio de
la otra. Solo un token de concurrencia —o un bloqueo explícito— lo detecta.

**Por qué `CheckDuplicateAsync` no basta:** compara cliente + importe + 3 días. Dos
cobros del mismo importe los caza, pero es una comprobación que la UI hace *antes*
y que el usuario puede confirmar y saltarse; y dos cobros de importes distintos
sobre la misma factura no los ve.

**El arreglo** es de dos líneas:

```csharp
// Invoice.cs
public uint Xmin { get; set; }

// AppDbContext.cs, dentro de mb.Entity<Invoice>(...)
e.Property(i => i.Xmin).IsRowVersion();
```

No requiere migración: `xmin` es una columna de sistema de PostgreSQL.

**Aplicado junto con el manejo de conflicto en los tres puntos que actualizan
facturas en lote**, que es lo que hacía que el arreglo no fuera de dos líneas:

| Punto | Qué hace ahora al chocar |
|---|---|
| `BillingService.MarkOverdueInvoicesAsync` | Recarga las filas en conflicto, las **saca del lote** y confirma el resto. Si alguien acaba de pagarlas, no corresponde marcarlas vencidas; un cobro simultáneo no puede impedir que se marquen las otras mil. |
| `InvoiceOperationsService.MarkInvoicesSentAsync` | Igual: una factura que cambió es casi siempre una que acaban de cobrar, y una cobrada ya no es `Emitida`. Se omite y no se avisa de ella. |
| `PaymentService.VoidPaymentAsync` | **Rollback completo** con mensaje propio para el operador. Revertir sobre datos obsoletos falsearía el saldo, así que se deshace todo y se pide recargar. |

El test que documentaba el hueco se **invirtió** —ahora exige la excepción, como
el de `Client`— en vez de borrarse.

### 🟡 D-15 · Asientos de crédito falsos — **CORREGIDO (2026-08-24)**

Cuando el efectivo cubre la deuda entera y el cliente **además** tiene saldo,
`CalculateCredit` informa crédito consumido aunque no hiciera falta. Ejemplo:
saldo 100, deuda 50, paga 50 en efectivo → se asienta un `-50 AplicadoAFactura` y
un `+50 Acumulado`.

El saldo final es correcto (100, verificado en
`CreditLedgerInvariantProbeTests.Pago_en_efectivo_que_cubre_todo_TENIENDO_saldo_no_debe_gastarlo`)
y anular el pago también funciona, porque los dos asientos suman cero. Pero el
**historial de crédito del cliente muestra dos movimientos que nunca ocurrieron**,
y ese historial es lo que un operador mira para explicarle a alguien de dónde salió
su saldo.

**Corregido:** `CalculateCredit` solo echa mano del saldo por la parte que el
efectivo no cubre (`faltante = totalDebt - amount`). Si el efectivo basta, no se
genera ningún movimiento de crédito. Verificado en la sonda del invariante, que
ahora exige **cero movimientos** ligados a ese pago.

### 🟡 D-16 · `SlaCalculator` con bucle sin guarda — **CORREGIDO (2026-08-24)**

Sus dos funciones auxiliares llevan `for (guard = 0; guard < 365; ...)`, pero el
bucle principal es `while (minutes > 0)` sin tope. Si `EndHour <= StartHour`,
`minutesToEndOfDay` no es positivo, `minutes` no baja nunca y **el hilo del job de
SLA se queda girando**.

Hoy **no es alcanzable**: `TicketHelper:132` desvía el caso 24×7 antes de llamar, y
`ValidateDto` exige `startHour < endHour` para los horarios normales. Pero la
protección depende de dos guardas en otros archivos, no del propio cálculo.

**Corregido:** el bucle lleva ahora la misma guarda de 365 días que sus hermanas,
y lanza `ArgumentException` con un mensaje que **nombra el horario** cuando la
jornada no es útil. Un cuelgue silencioso se convirtió en un error legible.

### 🟡 D-17 · Factura de importe 0 nunca llegaba a `Pagada` — **CORREGIDO (2026-08-24)**

`InvoiceDomainService.CalculateStatus` comprueba `amountPaid <= 0` **antes** que
`amountPaid >= amount`, así que una factura de importe 0 se queda en `Emitida`
para siempre — y `Emitida` está en `OverdueEligible`, de modo que el job de
vencimiento acabaría marcándola **Vencida** con deuda 0.

Hoy no ocurre porque `BillingService` fija el estado a mano cuando el crédito cubre
la factura entera, sin pasar por `CalculateStatus`. Queda como mina para el día que
se emitan facturas de cortesía o de importe 0.

**Corregido:** `CalculateStatus` comprueba primero `amount <= 0` y devuelve
`Pagada` — una factura sin importe no tiene nada que cobrar. La sonda se invirtió
y además verifica que `Pagada` no está en `OverdueEligible`.

---

## F3 — Fase 3 (2026-08-21)

### 🟠 D-12 · Seis tests de slots dependían del día de la semana

Se destaparon solos al cruzar la medianoche del **jueves 20 al viernes 21**, sin que
nadie tocara ese código:

| Test | Cuándo falla |
|---|---|
| `InstallationHandlerTests.GetSlots_NoActiveInstallations_AllSlotsAvailable` | Jue/vie |
| `GetTicketVisitSlotsHandlerTests` (5 tests) | Vie por la tarde |

**Causa:** los handlers recorren de **hoy** a `hoy + DiasAdelante` y el horario de
respaldo es **L-V 8-18**. Los tests pedían una ventana de **2 días**, así que
ejecutados un viernes la ventana caía en fin de semana y no había ni un slot que
ofrecer. `GetTicketVisitSlots` además depende de la HORA: a las 17:21 ya casi no
quedan huecos hoy.

**Arreglo aplicado:** ventana de 7 días. Ninguno de los seis trata sobre "2 días"
—comprueban disponibilidad, SLA y capacidad—, así que ampliarla conserva su
intención y elimina la dependencia del calendario.

**Arreglo de fondo, hecho (2026-08-29) — por otra vía.** Inyectar `TimeProvider`
habría llevado a los dos handlers a **siete** dependencias, rompiendo la regla 2
de `CONVENCIONES.md`. En su lugar, la decisión que depende del calendario se
extrajo a `Domain/Services/SlotWindow`, donde "ahora" es un **parámetro**.

Al extraerla apareció que estaba escrita **dos veces, línea por línea idéntica**,
en `GetInstallationSlotsQuery` y `GetTicketVisitSlotsQuery` — el comentario de la
segunda lo decía sin rodeos: *"mismo bug ya corregido en
GetInstallationSlotsQuery"*. Se había corregido dos veces porque estaba dos
veces. Es el mismo patrón que `WorkingDays`, `OverduePolicy` y el prorrateo.

`SlotWindowTests` prueba ahora de frente lo que antes se esquivaba: viernes por
la mañana con ventana de dos días, viernes pasadas las 18:00 (cero huecos es la
respuesta CORRECTA), las 18:00 en punto contra las 17:59, un feriado en día
laborable, un horario 24x7 que sí abre en fin de semana, y la franja que empieza
justo ahora mismo.

#### Séptimo caso, con causa distinta (2026-08-23)

`CreateInstallationHandlerTests.TC_CREAR_01_PastDate_ReturnsFailure` falló un
domingo a las **20:09 hora de Bolivia**. Aquí no era el día de la semana sino el
**desfase de zona horaria**:

- El test construía la fecha con `DateTime.UtcNow.AddDays(-1)`.
- El validador compara contra `hoyLocal`, en hora de Bolivia (UTC−4).

Entre las 20:00 y las 24:00 bolivianas, UTC **ya pasó de día**. Así que
`UtcNow.AddDays(-1)` caía en el día de HOY en hora local — y hoy no es pasado, de
modo que la validación aceptaba la fecha y el test esperaba lo contrario.

**Arreglo:** el test calcula ahora la fecha en hora de Bolivia, la misma que usa
el validador. Falla durante 4 horas al día, todos los días: es el más difícil de
atribuir de los siete, porque no depende del calendario sino de la hora a la que
se ejecute la suite.

> Refuerza la conclusión: mientras el reloj se lea directamente en el código de
> producción, estos casos van a seguir apareciendo de uno en uno. `TimeProvider`
> deja de ser una mejora estética y pasa a ser el arreglo real.

> Es la segunda vez que la suite falla por dependencia temporal, tras D-03. La
> diferencia: D-03 eran los jobs de producción corriendo contra la base de test;
> ésta es el propio test atado al calendario. Misma familia, causas distintas.

### 🔴 D-24 · El enlace de recuperación de contraseña podía quedar reutilizable — **CORREGIDO**

Salió al revisar la prioridad media de D-13. `ResetPasswordCommand` hacía esto:

```csharp
_repo.Update(user);
await _repo.SaveChangesAsync();        // ← contraseña cambiada, confirmado
resetToken.Used = true;
_resetRepo.Update(resetToken);
await _resetRepo.SaveChangesAsync();   // ← si esto falla…
```

Si el segundo guardado fallaba —una caída de base entre uno y otro basta— la
contraseña quedaba cambiada y **el token de recuperación seguía sin marcar como
usado**. Un enlace pensado para un solo uso pasaba a admitir varios, y cualquiera
con acceso a ese correo podía volver a cambiar la contraseña dentro de su hora de
validez.

No hacía falta una transacción: los dos repositorios comparten `DbContext`, así
que basta con mutar ambos y guardar **una** vez.

Mismo tratamiento en `ForgotPasswordCommand` y `ResendActivationCommand`, donde
además había un `SaveChangesAsync` **dentro del bucle** que invalidaba los enlaces
anteriores — uno por token. Si fallaba al crear el nuevo, el usuario se quedaba
con todos sus enlaces anulados y ninguno válido, sin poder recuperar la cuenta
hasta volver a pedirlo.

### 🟠 D-13 · Métodos con varias escrituras y sin transacción — **CERRADO (27 → 7, todos justificados)**

**Estado 2026-08-29: cerrado.** De los 27 originales quedan **7**, y los siete
llevan escrito al lado por qué son seguros. `python scripts/escrituras-sin-transaccion.py`
reproduce el recuento y los cuenta como justificados.

**Los cinco que resultaron ser fallos de verdad**, todos arreglados por la misma
vía —dejar **un solo guardado**, sin transacción ni dependencia nueva—:

| Método | Qué pasaba si fallaba el segundo guardado |
|---|---|
| `InvoiceCreditService.ApplyCreditAsync` | Factura saldada y crédito del cliente **sin descontar**: dinero regalado, en silencio |
| `ClientQrService.UploadQrAsync` | QR anterior desactivado y ninguno nuevo — el cliente **sin forma de pagar**. Entre los dos guardados hay una subida de archivo, que es lo que falla |
| `CancelInstallationCommand` | Instalación cancelada y su ticket **abierto para siempre**: nadie vuelve a mirarlo porque la instalación ya figura cerrada. Mismo modo de fallo que el original |
| `AdminSettingsService.SaveAsync` | El guardado estaba **dentro del bucle** de diez ajustes: fallar en el sexto dejaba cinco aplicados y cinco no, y la pantalla reportaba error |
| `PlanService.UpdateAsync` | Una entrada en el historial diciendo que el plan cambió, **con el plan sin cambiar**. Un registro de auditoría que miente |

**Cuatro más eran guardados redundantes**, que no rompían nada pero daban a
entender que había escrituras separadas capaces de quedar a medias:
`AssignTechniciansCommand` y `CannedResponseCommands` tenían **dos
`SaveChangesAsync` idénticos seguidos**; `NotifSendService` guardaba por separado
los envíos y el registro de los omitidos (y la cancelación y su motivo).

**Los siete que quedan, y por qué se quedan:**

- `CompanyProfileService`, `BotConfigService` — los dos guardados están en ramas
  **excluyentes** (crear o actualizar): solo corre uno.
- `AuthService.LoginAsync`, `NotifPublisher.PublishAsync` — el primer guardado
  está en una rama que termina en `return`.
- `InvoiceOperationsService.MarkInvoicesSentAsync` — el segundo vive en el
  `catch` de concurrencia: solo corre si el primero lanzó.
- `InitialChargesService.ApplyAsync` — corre dentro de la transacción que abre
  `RegisterClientCommand`. Es además **el único sitio de Application con una
  consulta entre dos escrituras**: las facturas retroactivas se releen después de
  crearlas, así que ahí el guardado intermedio hace falta de verdad.
- `ScheduleVisitCommand` — ya lo tenía justificado.

**Lo que costó llegar aquí, anotado para el próximo recuento:** el contador mide
texto, no caminos de ejecución. De los 16 que señalaba, **once eran falsos
positivos** —ramas excluyentes, `return` de por medio, o el `catch`—. La
clasificación automática por "¿hay mutaciones después del primer guardado?"
tampoco bastó: cruzaba métodos distintos del mismo archivo. Hubo que leerlos uno
a uno.

**El triaje que cambió el enfoque.** Todos los repositorios comparten el mismo
`DbContext`, así que un `SaveChangesAsync` persiste todo lo pendiente. El riesgo
solo existe si hay **mutaciones después del primer guardado**; si no las hay, los
guardados siguientes no hacen nada y la operación ya era atómica. Y solo UN método
en todo Application hace una consulta entre dos guardados
(`InitialChargesService`, que ya va dentro de la transacción de su llamador), así
que en el resto el guardado intermedio **no hace falta para nada**.

Conclusión: para la mayoría la corrección no es añadir una transacción, es
**dejar un solo guardado**. Sin `IUnitOfWork`, sin dependencia nueva, y más
correcto. Se aplicó a los seis de esta tanda.

Los cinco de prioridad alta, resueltos, y **no todos igual**:

| Método | Qué se hizo |
|---|---|
| `AssignBoxToInstallationCommand` | Transacción |
| `CompleteInstallationWithBoxCommand` | Transacción |
| `RescheduleInstallationCommand` | Transacción |
| `RescheduleTicketVisitCommand` | Transacción (el aviso al cliente queda fuera) |
| `ConfirmEmailCommand` | **Ninguna** — ya era atómico |

`ConfirmEmailCommand` es el que merece explicación: tenía tres
`SaveChangesAsync` seguidos y **ya era atómico**. Los dos repositorios comparten
el mismo `DbContext` y el token viene rastreado de la consulta, así que el primer
guardado persistía la activación de la cuenta y el marcado del token en la misma
transacción implícita de EF. Las otras dos llamadas no hacían nada, pero daban a
entender que eran escrituras separadas que podían quedar a medias.

Se eliminaron y se explicó por qué basta una. **Envolverlo en una transacción
habría sido añadir ceremonia sobre algo que ya estaba bien** — exactamente lo que
esta entrada advertía de no hacer a ciegas.

Cubierto por dos tests de rollback en `CoverageHandlerTests`, que comprueban que
un fallo al guardar deshace y no confirma.

### 🟠 D-13 (original) · 27 métodos con varias escrituras y sin transacción

`CompleteInstallationCommand` (corregido en F3.3) no era un caso aislado. La
auditoría de F3.4 encontró **27 métodos** con más de un `SaveChangesAsync()` y sin
`IUnitOfWork`:

**Prioridad alta** — mismo patrón exacto que el ya corregido (caja + instalación +
ticket), así que comparten el mismo modo de fallo:

```
Coverage/Commands/AssignBoxToInstallationCommand.cs      3 escrituras
Coverage/Commands/CompleteInstallationWithBoxCommand.cs  3 escrituras
Installations/Commands/RescheduleInstallationCommand.cs  3 escrituras
Tickets/Commands/RescheduleTicketVisitCommand.cs         3 escrituras
Users/Commands/ConfirmEmailCommand.cs                    3 escrituras
```

**Prioridad media** — 2 escrituras cada uno:

```
Installations/Commands/AssignTechniciansCommand.cs · CancelInstallationCommand.cs
Tickets/Commands/AssignTicketCommand.cs · ChangeTicketStatusCommand.cs
                 CloseTicketCommand.cs · ScheduleVisitCommand.cs
                 CannedResponseCommands.cs
Users/Commands/ForgotPasswordCommand.cs · ResendActivationCommand.cs
               ResetPasswordCommand.cs
Services/Admin/AdminSettingsService.cs · CompanyProfileService.cs
Services/Auth/AuthService.cs (LoginAsync) · RefreshTokenService.cs
Services/Bot/BotConfigService.cs
Services/Clients/ClientQrService.cs
Services/Invoices/InvoiceOperationsService.cs (ApplyCreditAsync)
Services/Notifications/NotifPublisher.cs · NotifSendService.cs (x2)
Services/Plans/PlanService.cs
Services/Tickets/BusinessScheduleService.cs
```

**No se corrigieron en F3.** Cada uno exige decidir si *necesita* atomicidad —
algunos no: `AuthService.LoginAsync` escribe el contador de intentos fallidos y el
token, y que uno sobreviva sin el otro es tolerable. Aplicar transacciones a los 27
a ciegas sería tan irresponsable como no aplicarlas.

**Cómo abordarlo:** empezar por los cinco de prioridad alta, uno por PR, con un test
de rollback como el de `InstallationEvidenceTests.Completar_SiFallaElCierreDelTicket_RevierteTodoYNoConfirma`.
Para los que se decida NO envolver, dejar un comentario explicando por qué —
la regla 5 de `CONVENCIONES.md`.

---

## F0 — Fase 0 (2026-08-20)

### 🔴 D-01 · Tres migraciones eran invisibles para EF Core — **CORREGIDO en F0.4**

`FixPaymentReceiptGeneratedByFK`, `AddCoverageModule` y `AddInstallationTechniciansV2`
no tenían `[DbContext(typeof(AppDbContext))]` ni figuraban en `MigrationsDbContextLink.cs`.
EF las ignoraba **en silencio**: nunca se aplicaron, y sus cambios llegaron a producción
por SQL directo.

**Síntoma:** `MigrateAsync()` sobre una base limpia fallaba con
`42703: column "ReminderSentAt" of relation "Installations" does not exist`.

**Impacto histórico:** es la causa raíz de los 502 en despliegues que se venían
parcheando con SQL manual.

**Corrección:** las tres reescritas como SQL idempotente + `[DbContext]` añadido.
Ver `ADR-004`. Requiere el paso manual de `docs/sql/F0-registrar-migraciones.sql`.

### 🔴 D-02 · Cuatro tablas existían solo en producción — **CORREGIDO en F0.4**

`CoverageQueries`, `GeocodeCaches`, `NapPorts` y `PortReservations` estaban mapeadas
en `AppDbContext` y existían en producción, pero **ninguna migración las creaba**.
Una base reconstruida desde cero salía sin ellas.

**Corrección:** nueva migración `20260820000001_BackfillCoverageSupportTables`,
idempotente.

### 🔴 D-03 · Test flaky — **CAUSA RAÍZ ENCONTRADA Y CORREGIDA**

**Resuelto el 2026-08-20.** Las hipótesis que había abajo (contención de
contenedores, hora del día) eran **ambas incorrectas**. Se dejan al final como
registro de lo que se descartó.

#### Cómo se cazó

Diez ejecuciones seguidas de la suite de integración guardando un `.trx` por
corrida (`scratchpad/hunt-flaky.sh`). Falló **1 de 10**:

```
corrida 9:  Failed: 1, Passed: 126, Total: 127
  → Billing.InvoiceTypeFilterIntegrationTests
    .ConFiltroDeTipo_ElListadoMuestraSoloEseTipo(tipo: "Mensualidad", montoEsperado: 149)
```

Y el error del `.trx` lo dijo todo:

```
23503: update or delete on table "Clients" violates foreign key constraint
       "FK_NotifOutbox_Clients_ClienteId" on table "NotifOutbox"
```

#### La causa

`CustomWebApplicationFactory` arranca el `Program` real, y `Program` registra
**once `BackgroundService`**. `WebApplicationFactory` levanta el host de verdad,
así que **esos jobs quedaban vivos durante toda la suite, ejecutándose contra la
base de pruebas**.

Cinco de ellos publican en `NotifOutbox`: `SlaAlertJob`, `AutoSuspendClientJob`,
`AutoCloseTicketJob`, `SendInstallationRemindersJob` y
`ApplyScheduledPlanChangesJob`.

La limpieza de cada test hace, en este orden:

```sql
DELETE FROM "NotifOutbox";   -- ①
...
DELETE FROM "Clients";       -- ②
```

Si el temporizador de un job caía **entre ① y ②** e insertaba una fila en
`NotifOutbox`, el `DELETE FROM "Clients"` violaba la FK y el test reventaba.

Eso explica las tres características del fallo:
- **Intermitente (~10%)**: depende de que un temporizador coincida con esa ventana.
- **Test distinto cada vez**: le tocaba al que estuviera limpiando en ese instante.
- **Invisible en CI**: los runners son más rápidos y la ventana se estrecha.

#### El arreglo

`CustomWebApplicationFactory` elimina los `IHostedService` del espacio de nombres
`TelecomBoliviaNet.Infrastructure.Jobs` antes de levantar el host.

Se filtra por espacio de nombres a propósito: quitar **todos** los
`IHostedService` eliminaría también `GenericWebHostService`, que es el que levanta
el servidor de pruebas.

Ningún test dependía de que los jobs se dispararan solos: los dos que los prueban
(`ScheduledPlanChangeIntegrationTests` y `AutoSuspendCharacterizationTests`) los
instancian a mano y llaman a `RunAsync`, precisamente para no depender de la
ventana horaria.

#### Verificación

Mismas 10 corridas, antes y después del arreglo:

| | Corridas | Fallos | Duración |
|---|---|---|---|
| **Antes** | 10 | **1** (corrida 9) | 2m 16s – 2m 25s |
| **Después** | 10 | **0** | 2m 14s – 2m 16s |

La varianza de duración también baja: sin jobs de fondo compitiendo por la base,
las corridas son consistentes.

El script quedó en el repositorio como `scripts/hunt-flaky.sh` para volver a
usarlo si aparece otro intermitente.

#### Por qué importaba

Un job de producción corriendo contra la base de un test no solo produce fallos
intermitentes: puede **modificar los datos que el test está comprobando**. Una
aserción podía fallar —o pasar— por lo que hizo `AutoSuspendClientJob` de fondo,
no por lo que hacía el código bajo prueba.

---

<details>
<summary>Diagnóstico original (hipótesis descartadas)</summary>

### D-03 · Un test de integración es flaky — origen NO confirmado

**Observado en local (Windows + Docker Desktop):**

| Ejecución | Resultado |
|---|---|
| Línea base, antes de tocar nada | 91/91 ✅ (una sola ejecución) |
| Tras añadir `SchemaParityTests` | 94/95 ❌ |
| Reejecución inmediata | 95/95 ✅ |
| Tras añadir `BillingCharacterizationTests` | 100/101 ❌ |
| Reejecución inmediata | 101/101 ✅ |

En CI (Linux, GitHub Actions) la suite pasó a la primera.

**No está confirmado si el fallo es preexistente o lo introdujeron los tests
nuevos.** La línea base solo se ejecutó una vez, así que no hay evidencia de que
fuera estable antes. Sería deshonesto darlo por heredado.

**Hipótesis principal (contención de contenedores).** `IClassFixture<T>` crea una
instancia **por clase de test**, así que cada clase que usa
`CustomWebApplicationFactory` levanta **su propio contenedor PostGIS**. Con
`parallelizeTestCollections: false` van en serie, pero la Fase 0 pasó de 9 a 11
contenedores por ejecución. En Docker Desktop sobre Windows eso aumenta la presión
de arranque/parada y es una causa plausible de fallos intermitentes.

**Hipótesis secundaria:** los tests de slots sensibles a la hora del día
(`RescheduleTicketVisitTests`, `ScheduleRepositoryTests`), un problema ya conocido
del proyecto.

**Por qué importa:** un test flaky envenena la línea base — a partir de ahora, cada
fallo obliga a preguntarse "¿rompí algo o es el flaky?". Debe resolverse **antes de
F3**, que es cuando empiezan los refactors con riesgo.

**Cómo atacarlo, en este orden:**
1. Ejecutar la suite 10 veces con `--logger trx` y quedarse con el nombre del test
   que falla. Sin el nombre, todo lo demás es especular.
2. Si es contención: pasar de `IClassFixture` a `ICollectionFixture` con una
   `[CollectionDefinition]` compartida, para levantar **un** contenedor por
   ejecución en vez de once.
3. Si es la hora del día: inyectar `TimeProvider` en la lógica de slots y fijarlo
   en los tests.

**Resultado:** el paso 1 dio con el nombre y el error a la primera, y descartó
las dos hipótesis. Ninguna de ellas era la causa. Queda como recordatorio de que
**sin el nombre del test todo lo demás es especular** — la hipótesis de la
contención parecía sólida (la Fase 0 subió de 9 a 15 contenedores) y era falsa.

</details>

### 🟡 D-10 · Cada clase de test levanta su propio contenedor PostGIS

Descubierto mientras se investigaba D-03. `IClassFixture<T>` crea una instancia
**por clase**, así que una ejecución de la suite de integración levanta **15
contenedores PostGIS** (14 de `CustomWebApplicationFactory` + 1 de
`MigratedDatabaseFixture`), uno detrás de otro.

No es un bug —la suite pasa— pero cuesta: cada ejecución tarda **~2m 20s**, y una
buena parte es arrancar y parar contenedores.

**No se tocó** porque no era la causa de D-03 y el cambio tiene riesgo real:
compartir una base entre clases expone a `ScheduleRepositoryTests` (1 `DELETE`),
`RescheduleTicketVisitTests` (3) y `SecurityHeadersTests` (0) a restos de otras
clases. Sería cambiar un flaky resuelto por uno nuevo.

**Si algún día molesta:** `[CollectionDefinition]` + `ICollectionFixture`, pero
antes hay que darles a esas tres clases una limpieza tan completa como la de las
demás.

### 🟡 D-04 · Columnas huérfanas en la base

Existen en PostgreSQL pero el modelo de EF ya no las mapea. Registradas en
`SchemaParityTests.ColumnasHuerfanasConocidas` para que la lista solo pueda encoger:

| Columna | Origen | Qué decidir |
|---|---|---|
| `Clients.search_vector` | `20260409000001_AddPerformanceIndexesAndPhase1Fixes` | Columna `tsvector` para búsqueda full-text que nadie usa (la búsqueda va con `LIKE`). **F7** decide si se aprovecha o se borra. |
| `NotifJobLog.JobName`, `NotifJobLog.LastRun` | `20260427000001` | Tabla sin entidad ni `DbSet`; la escribe el notifier por SQL. ¿Entidad propia o borrado? |
| `SupportTickets.CsatScore`, `CsatRespondedAt` | `20260508000001_Phase2Improvements` | Encuesta de satisfacción nunca implementada en el modelo. Confirmar que no hay datos antes de borrar. |

### 🟠 D-11 · Tres entidades no tenían repositorio registrado — **CORREGIDO en F1.1**

`DependencyInjection.AddRepositories()` registraba `IGenericRepository<T>` **a mano,
entidad por entidad** (44 líneas). La lista se había quedado corta:

| Entidad | Consecuencia |
|---|---|
| `DashboardPreference` | Inyectar su repositorio reventaba en runtime |
| `NapPort` | Ídem |
| `PortReservation` | Ídem |

No explotaba porque el código que las usa (`NapPortService`, `PortReservationStore`)
va contra `AppDbContext` directamente. Pero era una mina: el primer handler que
inyectara `IGenericRepository<NapPort>` habría fallado con un 500 en producción,
sin ningún aviso en compilación.

**Cómo apareció:** `DependencyResolutionTests` recorre el modelo de EF y exige
repositorio para cada entidad real, en vez de fiarse de una lista escrita a mano.
Falló antes del cambio y pasa después.

**Corrección:** registro abierto `services.AddScoped(typeof(IGenericRepository<>),
typeof(GenericRepository<>))`. De 44 líneas a 1, y ya no se puede olvidar ninguna.

### 🟡 D-05 · Conflicto de versiones de EF Core en los proyectos de test — **CORREGIDO en F1**

Los `.csproj` de test pedían `Microsoft.EntityFrameworkCore 8.*` y resolvían una
versión distinta a la de `Infrastructure`, con dos warnings `MSB3277` en cada build.

Fijados los tres proyectos a **8.0.29** (la que resuelve `Infrastructure` vía
`Npgsql.EntityFrameworkCore.PostgreSQL`) y añadida la referencia explícita a
`Microsoft.EntityFrameworkCore.Relational`, que faltaba en dos de ellos.

Build: **0 warnings, 0 errores**.

<details>
<summary>Diagnóstico original</summary>

### D-05 · Conflicto de versiones de EF Core en los proyectos de test

`dotnet build` emite 2 warnings `MSB3277`: los `.csproj` de test piden
`Microsoft.EntityFrameworkCore 8.*` y resuelven **8.0.29**, mientras `Infrastructure`
usa **8.0.11**. No rompe nada hoy, pero es exactamente el tipo de diferencia que
produce fallos irreproducibles entre local y CI.

**Arreglo:** fijar la misma versión exacta en todos los `.csproj`. Va en **F1**.

> Nota al hacerlo: se fijó primero a 8.0.11 por leer el warning al revés — la que
> resuelve `Infrastructure` es la **8.0.29**, la más alta. El build lo cazó al
> instante con `CS1705` ("uses a higher version than referenced assembly").

</details>

### 🟡 D-06 · Los tres `ci.yml` de servicio estaban inertes — **CORREGIDO en F0.2**

Al unificar los cuatro servicios en un monorepo, los workflows quedaron en
`<servicio>/.github/workflows/`. GitHub Actions solo lee `.github/workflows/` de la
**raíz**: no se ejecutaba ninguna comprobación en ningún push.

**Corrección:** creado `.github/workflows/backend-ci.yml` en la raíz, con filtro de
rutas. **Pendiente:** hacer lo mismo para chatbot y frontend (fuera del alcance de F0).

### 🟡 D-08 · Rama muerta en `BillingService`: el cliente sin plan no existe — **RESUELTO**

`GenerateMonthlyInvoicesAsync` trata `client.Plan is null` como error y lo cuenta
en `BillingJobResultDto.Errors`:

```csharp
if (client.Plan is null)
{
    _logger.LogWarning("Cliente {TbnCode} sin plan, omitido", client.TbnCode);
    errors++;
    continue;
}
```

Esa rama es **inalcanzable contra la base real**: existe la FK
`FK_Clients_Plans_PlanId`, así que ningún cliente puede referenciar un plan que no
exista. Se descubrió al intentar sembrar ese caso en
`BillingCharacterizationTests` — PostgreSQL lo rechazó con `23503`.

**Consecuencia:** `Errors` siempre vale 0 en esa rama, y el panel muestra un
contador que nunca se moverá.

**Resuelto (2026-08-29): invariante, no caso de negocio.** La rama se conserva
—quitarla convertiría un `Include` olvidado en una `NullReferenceException` a
mitad de la facturación mensual— pero ahora dice lo que de verdad significa: si
un cliente llega sin plan cargado, la FK descarta que sea un problema de datos,
así que falta un `Include` en la consulta. Es un `LogError`, no un `LogWarning`
sobre "cliente sin plan".

El contador debe seguir en cero. Si alguna vez se mueve, no hay ningún cliente
que arreglar: hay una consulta que corregir. `BillingPreviewIntegrationTests` lo
fija.

### 🟠 D-09 · El serial de la ONU no se propaga de la instalación al cliente — **CORREGIDO**

`CompleteInstallationCommand` guarda `EquipoOnuSerial` en la **instalación**, pero
nunca lo copia a `Client.OnuSerialNumber`. Son dos fuentes de verdad para el mismo
dato y ya divergen: un cliente puede tener la ONU registrada en su instalación y el
campo del cliente vacío.

Se nota en `CancelClientCommand`, que crea el ticket de recolección leyendo
`client.OnuSerialNumber` — si está vacío, el ticket sale sin el serial del equipo
que hay que recuperar.

**Congelado en** `InstallationCompleteCharacterizationTests.El_serial_de_la_ONU_NO_se_copia_al_cliente`.
Si algún día se sincronizan, ese test lo detectará y habrá que actualizarlo a
conciencia.

**Corregido (2026-08-29).** `CompleteInstallationCommand` copia el serial a
`Client.OnuSerialNumber` dentro de la MISMA transacción: una instalación cerrada
con la ficha sin actualizar es exactamente la inconsistencia que se cierra. El
cliente ya venía cargado por `GetForCommandAsync`, así que no hizo falta una
séptima dependencia.

Dos decisiones que el código deja escritas: un cierre **sin** serial no borra el
que el cliente ya tuviera —que el técnico no lo anote no significa que no haya
ONU— y un serial distinto sí lo sustituye, pero deja el anterior en el log,
porque es un cambio de equipo y no puede desaparecer sin rastro.

El test de caracterización que congelaba el comportamiento viejo se actualizó
**conscientemente**, que es justo para lo que estaba puesto, y se le sumó el caso
del cierre sin serial.

**Dónde se resuelve de verdad:** el módulo de inventario (entidad de equipo con
serial único y movimientos). Esto es la corrección mínima, no el diseño final.

### 🟡 D-07 · `appsettings.Production.json` con contraseña por defecto — **CORREGIDO en F8.4**

Contiene `Password=telecom_pass_2025`, el mismo default de `docker-compose.yml`.
No es la credencial de Railway (esa se inyecta por variable de entorno), pero es una
contraseña versionada. **F8** decide si se vacía como en `appsettings.json`.


---

## D-25 — Un `[Authorize]` en el método NO reemplaza al de la clase: los amplía nadie

**Dónde:** todos los controladores con política a nivel de clase.
**Encontrado:** al escribir `BotEndpointsIntegrationTests` (F8.1), que dio 403 en
22 de 23 rutas que "según los atributos" tenían que pasar.

En ASP.NET Core, cuando una clase lleva `[Authorize(Policy = "A")]` y un método
lleva `[Authorize(Policy = "B")]`, **se exigen las dos**. No se sustituye: se
intersecan. El proyecto estaba escrito dando por hecho lo contrario.

La consecuencia es que varios atributos del código **no hacen nada de lo que
parecen decir**:

```csharp
[Authorize(Policy = "AdminOrTecnico")]      // ← clase
public class ClientsController
{
    [HttpGet("by-phone")]
    [Authorize(Policy = "AllRoles")]        // ← "que entren todos"
    public async Task<IActionResult> GetByPhone(...)
}
```

Efectivo: `AdminOrTecnico ∩ AllRoles = AdminOrTecnico`. Un usuario
**SocioLectura nunca pudo** consultar un cliente por teléfono, ni ver su deuda,
ni los huecos de agenda, pese a que el atributo anuncia lo contrario. Nadie lo
notó porque ese rol casi no se usa; el chatbot tampoco lo notó porque entraba
como Técnico, que sí pasa el filtro de la clase.

**Alcance:** 33 acciones repartidas en 8 controladores heredaban la política de
su clase sin declararla. Todas quedaron **fijadas explícitamente** con la que ya
tenían de hecho — un no-op deliberado, para que ampliar el piso de la clase (y
admitir al bot) no abriera de paso 33 endpoints que nadie revisó.

**Lo que NO se hizo:** revisar si el `AllRoles` que no amplía debería ampliar de
verdad. Eso es una decisión de negocio sobre qué ve un socio, no un arreglo
técnico, y cambiarla ahora movería permisos de personas reales sin que nadie lo
haya pedido. Queda anotado.

---

## OBS-04 — El chatbot se trae 100 instalaciones de toda la empresa para buscar una — **CORREGIDO**

**Dónde:** `SistemaApiService.findScheduledInstallationByPhone` (chatbot).

Para saber si un teléfono tiene una instalación agendada, pide
`GET /api/instalaciones?PageSize=100` —el listado general, sin filtro— y cruza
en memoria contra `ProspectPhone` y `ClientePhone`. Es decir: para atender a una
persona, el bot lee el nombre, el teléfono y la dirección de las últimas cien
que pasaron por la agenda.

Es también lo que obliga a que el rol `Bot` tenga acceso al listado completo de
instalaciones, que es la concesión más ancha de las 22 de F8.1.

**Corregido (2026-08-29).** Existe `GET /api/instalaciones/vigente`, que acepta
`clienteId` o `telefono` y devuelve **una** instalación: la más próxima que aún
no se cerró. El teléfono cubre también a los prospectos, que todavía no son
clientes y por eso no tienen id que pasar.

Sustituye a los **dos** sitios donde el chatbot leía el listado general
(`findScheduledInstallationId` y `findScheduledInstallationByPhone`), así que la
concesión se pudo **retirar**: `GET /api/instalaciones` vuelve a ser
`AdminOrTecnico`. Era la más ancha de las 22 de F8.1, y ahora está en la lista de
lo que el bot **no** puede alcanzar, con su test.

**Y una regla menos duplicada:** buscar por teléfono con y sin el prefijo `591`
estaba escrito dentro de `GetClientByPhoneQuery`, y el chatbot tenía la suya en
TypeScript. Ésta habría sido la tercera copia, así que vive en
`Domain/Services/PhoneLookup`.
