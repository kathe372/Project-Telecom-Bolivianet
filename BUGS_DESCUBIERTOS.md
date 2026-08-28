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

### 🟡 OBS-02 · El proxy del chatbot no distingue "el bot dijo que no" de "el bot no responde"

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

**No se cambió.** Arreglarlo bien significa devolver un `Result` en vez de `bool`
y tocar el controlador y el frontend, que es una decisión de producto sobre qué
ve el operador, no una limpieza de refactor.

**Lo que sí mejoró:** la política estaba copiada once veces y su motivo escrito
una sola. Ahora vive en `BotProxyBase.SinRomperElPanelAsync`, así que el día que
se decida distinguir los dos casos es **una** edición y no once.

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

`IsWorkingDay` y `OpenHours` se quedan como red: interpretan correctamente las
filas que ya estén mal guardadas en producción, que la normalización solo arregla
la próxima vez que se editen.

### 🟡 OBS-03 · Un segmento con el operador equivocado no alcanza a nadie y no lo dice

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

**No se cambió.** Avisar al guardar el segmento es una decisión de producto sobre
la pantalla, no una limpieza de refactor. Lo que sí se hizo (F5):

- los operadores viven en `Domain/Services/SegmentOperators`, con 20 tests que
  fijan el comportamiento, incluida la asimetría;
- se expone `SegmentOperators.IsSupported(op, numericField)`, que es exactamente
  lo que haría falta para validar al guardar — un `if` en el servicio de
  segmentos, cuando se decida.

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

**Arreglo de fondo, pendiente:** los handlers leen `DateTime.UtcNow`
directamente. Inyectar `TimeProvider` permitiría fijar la fecha en los tests y
probar de verdad los casos de borde (viernes por la tarde, feriados) en vez de
esquivarlos. Candidato natural para **F5**, al tocar esos handlers.

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

### 🟠 D-13 · Métodos con varias escrituras y sin transacción — **PRIORIDAD ALTA CERRADA (5/5)**

**Estado 2026-08-27:** medido por MÉTODO, no por archivo —dos guardados en
métodos distintos no comparten riesgo—, quedan **18**. El recuento se reproduce
con `python scripts/escrituras-sin-transaccion.py`.

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

### 🟡 D-08 · Rama muerta en `BillingService`: el cliente sin plan no existe

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

**Qué hacer:** en **F5**, al partir `BillingService`, decidir entre eliminar la
rama (y el contador) o convertirla en una aserción de invariante. No tocar antes:
el test de caracterización congela `Errors == 0` y detectará el cambio.

### 🟠 D-09 · El serial de la ONU no se propaga de la instalación al cliente

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

**Dónde resolverlo:** es exactamente el problema que ataca el módulo de inventario
(entidad de equipo con serial único y movimientos), analizado en la conversación
previa al plan. Mientras tanto, la corrección mínima es propagar el serial al
completar.

### 🟡 D-07 · `appsettings.Production.json` con contraseña por defecto

Contiene `Password=telecom_pass_2025`, el mismo default de `docker-compose.yml`.
No es la credencial de Railway (esa se inyecta por variable de entorno), pero es una
contraseña versionada. **F8** decide si se vacía como en `appsettings.json`.
