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

### 🟠 D-13 · 27 métodos con varias escrituras y sin transacción

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
