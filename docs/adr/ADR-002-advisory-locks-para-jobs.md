# ADR-002 — Advisory locks de PostgreSQL para coordinar los jobs

**Fecha:** 2026-08-20
**Estado:** Aceptado
**Contexto:** Fase 2 del `PLAN_MEJORA_TECNICA_2026-08.md`

---

## Contexto

El backend registra **once `BackgroundService`**. Todos siguen el mismo patrón:

```
leer última corrida → decidir si toca → ejecutar → marcar como ejecutado
```

y marcan **al final**. Con dos instancias del backend:

```
t=0    Réplica A: lee lastRun=ayer → decide ejecutar
t=0    Réplica B: lee lastRun=ayer → decide ejecutar     ← nadie se lo impide
t=0-5  Ambas facturan / suspenden / envían el mismo WhatsApp
t=5    Ambas marcan lastRun=hoy
```

El sistema tenía por tanto un **techo de una réplica**. No solo impedía escalar
horizontalmente: durante un despliegue *rolling* conviven la instancia vieja y la
nueva unos segundos, y ésa era ya una ventana real de duplicación.

Consecuencias concretas por job:

| Job | Qué duplicaría |
|---|---|
| `BillingBackgroundJob` | Las facturas del mes |
| `AutoSuspendClientJob` | El corte y su aviso por WhatsApp |
| `ApplyScheduledPlanChangesJob` | El cambio de plan diferido |
| `SlaAlertJob`, `SendInstallationRemindersJob`, `QrExpiryAlertJob`, `CompanyQrExpiryAlertJob` | Avisos al cliente (protección solo parcial vía flags por registro) |
| `TokenCleanupJob`, `ExpirePortReservationsJob`, `NapPortSyncJob`, `AutoCloseTicketJob` | Trabajo redundante (idempotentes) |

---

## Decisión

Envolver la ejecución de los once jobs en `JobLease.TryRunExclusiveAsync`, que se
apoya en `pg_try_advisory_lock`.

### Por qué advisory locks y no una tabla de locks propia

`pg_try_advisory_lock` es **no bloqueante** (devuelve `false` en vez de esperar) y
el lock vive atado a la **sesión**: si el contenedor muere a mitad de la
ejecución, PostgreSQL lo libera solo al cerrarse la conexión.

Una tabla de locks obliga a inventar un TTL, a decidir qué hacer con las filas
zombis de un proceso que murió, y a acertar con el valor del TTL — corto y se
solapan dos réplicas, largo y un job queda bloqueado tras un reinicio. El advisory
lock no tiene ninguno de esos problemas.

### Por qué no Hangfire ni Quartz

Aportarían planificación distribuida, panel y reintentos, pero también una tabla
de estado propia, un modelo de serialización de jobs y una dependencia grande
para un sistema con **once tareas periódicas simples**. El proyecto ya usa
advisory locks en el worker Python del notifier: es tecnología conocida aquí.

Si en el futuro hicieran falta reintentos con backoff o visibilidad de cola,
conviene reevaluarlo.

### Dos detalles que parecen menores y no lo son

**1. La lectura del tracker va DENTRO del lease.**

```csharp
// MAL: las dos réplicas leen "ayer" antes de que ninguna tome el lock.
var lastRun = await JobRunTracker.ReadLastRunAsync(db, key, ct);
if (ShouldRun(lastRun))
    await JobLease.TryRunExclusiveAsync(db, job, () => RunAsync(ct), ct);

// BIEN
await JobLease.TryRunExclusiveAsync(db, job, async () =>
{
    var lastRun = await JobRunTracker.ReadLastRunAsync(db, key, ct);
    if (!ShouldRun(lastRun)) return;
    await RunAsync(ct);
    await JobRunTracker.MarkRanAsync(db, key, DayKey(now), ct);
}, ct);
```

**2. El identificador del lock NO puede salir de `string.GetHashCode()`.**

En .NET Core el hash de string está **aleatorizado por proceso**. Dos réplicas
calcularían identificadores distintos, cada una tomaría el suyo, y no habría
exclusión ninguna — con el agravante de que en local, con un solo proceso, todo
parecería funcionar. Se usa FNV-1a de 64 bits, determinista, con un test que lo
contrasta contra una implementación independiente.

### La conexión debe permanecer abierta

El lock vive en la sesión, y EF abre y cierra la conexión por comando. `JobLease`
la toma explícitamente (`conn.OpenAsync`) y la mantiene durante todo el trabajo;
si se dejara a EF, el lock se liberaría al terminar el primer `SELECT` y la
exclusión sería ficticia.

El `pg_advisory_unlock` va en un `finally` y **sin token de cancelación**: liberar
no debe cancelarse aunque el proceso se esté apagando por SIGTERM.

---

## Cómo se agrupó el trabajo

| Grupo | Jobs | Qué aporta el lease |
|---|---|---|
| **A** — con `JobRunTracker` | `BillingBackgroundJob`, `AutoSuspendClientJob`, `ApplyScheduledPlanChangesJob`, `TokenCleanupJob` | Cierra la carrera del propio tracker (lectura dentro del lock) |
| **B** — con flag por registro | `SlaAlertJob`, `SendInstallationRemindersJob`, `QrExpiryAlertJob`, `CompanyQrExpiryAlertJob` | Serializa el leer-decidir-escribir del flag. En los dos de QR, además, su `lastRunDate` vive **en memoria**: con dos procesos no coordina nada, y la garantía real la dan lease + flag persistido |
| **C** — idempotentes | `ExpirePortReservationsJob`, `NapPortSyncJob`, `AutoCloseTicketJob` | Evita trabajo redundante y competencia por las mismas filas. `AutoCloseTicketJob` además publica notificaciones, así que sí evita avisos duplicados |

`BillingBackgroundJob` usa **un solo lease para las tres tareas del tick**
(generación, recordatorios, vencimientos), no uno por bloque: así una única
réplica se ocupa del ciclo completo del minuto y no pueden repartírselo dos.

---

## Verificación

**Probado:**

- `JobLeaseTests` (7 tests) contra PostgreSQL real, con **dos sesiones
  independientes** —que es exactamente lo que son dos réplicas—: exclusión
  mutua, liberación al terminar, liberación **ante excepción**, independencia
  entre claves distintas y estabilidad del hash.
- Los 11 jobs pasan por el lease (verificado sobre el código).
- **Dos réplicas reales** del contenedor contra la misma base durante 15 minutos:
  ambas arrancan, `/health` responde `healthy` y **cero errores** en los logs.
  Esto cubre además un punto ciego conocido: los hosted services no los ejercita
  ningún test desde que se desactivaron para arreglar D-03.
- Suite completa: 893 tests, 0 fallos. Los 7 tests de caracterización de
  `AutoSuspend` confirman que la lógica de negocio no cambió.

**NO probado directamente:** no se llegó a observar en vivo el mensaje
"otra instancia tiene el lease" en los contenedores. Se registra a nivel `Debug` y
la configuración de Serilog en producción lo filtra; además los locks se toman y
sueltan en milisegundos, así que sondear `pg_locks` tampoco los captura.

Si se quisiera visibilidad en tiempo de ejecución, la opción sería emitir ese
mensaje a nivel `Information` la primera vez que una réplica cede el lease, en vez
de en cada tick.

---

## Consecuencias

- El backend **puede escalar a más de una réplica** y soportar despliegues rolling
  sin duplicar facturación ni notificaciones.
- Todo job periódico nuevo **debe** envolverse en `JobLease.TryRunExclusiveAsync`.
  Queda como regla en `CONVENCIONES.md`.
- Se añade una dependencia implícita de PostgreSQL (los advisory locks no son
  estándar SQL). Aceptable: el proyecto ya depende de PostGIS y de `xmin`.
