# Plan de Mejora Técnica — Backend TelecomBoliviaNet

**Versión:** 2 (2026-08-20) — corregida tras verificación ejecutando el proyecto
**Alcance:** `telecombolivianet-backend-develop` + migración de idioma coordinada con frontend, chatbot y notifier
**Modalidad:** un solo desarrollador, sistema **en producción** en Railway

> **Cambios respecto a la v1:** 10 correcciones tras contrastar el plan contra el código
> compilando y ejecutando `dotnet ef`. Tres de ellas invalidaban mecanismos completos del
> plan. Están listadas en la sección 1 y ya integradas en las fases.

---

## 0. Resumen ejecutivo

| Dimensión | Hoy | Objetivo | Fase |
|---|---|---|---|
| Seguridad | 8.5/10 | 9.5/10 | F8 |
| Mantenibilidad | 6.5/10 | 8.5/10 | F1, F5, F6, F9 |
| SOLID | 5.5/10 | 8/10 | F3, F4, F5 |
| Clean Code | 6/10 | 8/10 | F6 |
| Escalabilidad | 5/10 | 8/10 | F2 |
| Performance | 7/10 | 8.5/10 | F7 |

### Principio rector

> **Ninguna fase cambia comportamiento observable y refactoriza al mismo tiempo.**

Cada fase es *aditiva* o *equivalente*. Cuando necesita ambas, se parte en dos PRs.

### Orden

```
F0  Red de seguridad + reconciliar migraciones   ← sin esto, todo lo demás es apostar
F1  Higiene sin riesgo
F2  Escalabilidad: jobs coordinados
F3  Contrato de repositorio + UoW
F4  DIP: sacar EF Core de Application
F5  SRP: partir los fat services
F6  Idioma inglés en los 4 servicios              ← la más cara: toca 3 repos
F7  Performance
F8  Endurecer seguridad
F9  Convención única y documentación
```

**Duración total:** 13–17 semanas a tiempo parcial (la v1 decía 10–13; F6 en inglés total añade 3–4).

---

## 1. Correcciones de la v1 — qué estaba mal y por qué

Verificado compilando (`dotnet build` → 0 warnings, 0 errores) y ejecutando `dotnet ef`.

### 🔴 C1 — El modelo YA diverge de las migraciones (invalida el mecanismo de verificación de F5 y F6)

```
$ dotnet ef migrations has-pending-model-changes
Changes have been made to the model since the last migration. Add a new migration.
```

Y al generar una migración de diagnóstico, sale de **118 KB intentando `CreateTable` de TODO el esquema** — incluidas tablas que llevan meses en producción.

**Qué invalidaba de la v1:**
- F5.4 decía *"la migración generada DEBE estar vacía; si tiene algo, has perdido un mapeo"*. **Imposible**: nunca estará vacía, porque ya arrastra la deriva previa.
- F6.1 usaba el mismo protocolo. Igual de inválido.
- El test `HasPendingModelChanges().Should().BeFalse()` propuesto en F5 y F9 **fallaría el primer día**.

**Causa:** las migraciones de este proyecto están **escritas a mano**, no scaffoldeadas. Lo documenta el propio código en `20260802230700_AddInstallationProspectIdentityCard.cs`:

> *"escrita a mano, no con `dotnet ef migrations add` — el modelo de diseño ya está adelantado a la base real (varias tablas de sesiones anteriores se crearon por SQL directo, no por migración EF: CoverageQueries, CreditMovements, GeocodeCaches, NapPorts, PortReservations). Generarla automáticamente arrastraba ese drift entero como si fuera nuevo."*

**Además: no existe ni un solo archivo `.Designer.cs`** en las 63 migraciones, y `AppDbContextModelSnapshot.cs` no refleja el modelo real.

**Consecuencia para el plan:** F0 gana un paso nuevo (0.4) y la red de seguridad de F5/F6 pasa a comparar el **esquema real vía `information_schema`**, no la opinión de EF.

### 🔴 C2 — `dotnet ef migrations remove --no-build` borra la migración equivocada

Gotcha encontrado en carne propia durante esta verificación: con `--no-build`, EF lee el **ensamblado ya compilado**, que no contiene la migración recién añadida. Resultado: borró `20260804123000_AddProspectBackupPhone` (una migración real, desplegada) en vez de la de diagnóstico.

**Regla para todo el plan:** nunca `--no-build` en `migrations add` ni en `migrations remove`. Y como este repo **no está bajo git**, hacer copia de la carpeta `Migrations/` antes de cualquier comando `ef`.

### 🔴 C3 — Solo 4 de los 11 jobs usan `JobRunTracker`

La v1 los trataba a los 11 igual, con un snippet de migración que solo aplica a 4.

| Job | Mecanismo real | Riesgo con 2 réplicas |
|---|---|---|
| `BillingBackgroundJob` | `JobRunTracker` + `ShouldRunMonthly` | 🔴 Doble facturación |
| `AutoSuspendClientJob` | `JobRunTracker` + `ShouldRunDaily` | 🔴 Doble WhatsApp de corte |
| `ApplyScheduledPlanChangesJob` | `JobRunTracker` + `ShouldRunDaily` | 🔴 Doble cambio de plan |
| `TokenCleanupJob` | `JobRunTracker` + `ShouldRunDaily` | 🟢 Idempotente |
| `SlaAlertJob` | Timer + flag `ticket.SlaAlertSentAt` | 🟡 Carrera lectura-escritura del flag |
| `SendInstallationRemindersJob` | Timer + flag `inst.ReminderSentAt` | 🟡 Ídem |
| `QrExpiryAlertJob` | Timer + `MarkAlertSentAsync(clientId)` | 🟡 Ídem |
| `CompanyQrExpiryAlertJob` | Timer + `SystemConfigKeys.CompanyQrAlertSentDate` | 🟡 Ídem |
| `AutoCloseTicketJob` | Timer, sin flag | 🟢 Transición de estado idempotente |
| `ExpirePortReservationsJob` | Timer, sin flag | 🟢 Expirar es idempotente |
| `NapPortSyncJob` | Timer, sin flag | 🟢 Sincronizar es idempotente |

Los 🟡 tienen protección **parcial**: el flag por registro reduce la ventana, pero el patrón sigue siendo leer-decidir-escribir sin lock, así que dos réplicas pueden enviar el mismo WhatsApp. Los 🟢 no necesitan lock, solo dejan de valer la pena ejecutarlos dos veces.

### 🟠 C4 — `AppConstants.Billing` ya existe, y `InvoiceDueDays` significa otra cosa

La v1 proponía crear `AppConstants.Billing.DueDayOfMonth`. Pero:
- `public static class Billing` **ya existe** (con `DecimalPlaces` y `FallbackPlanName`).
- `AppConstants.Time.InvoiceDueDays = 5` **ya existe** — pero significa *"5 días a partir de hoy"* (`now.AddDays(5)` en `RegisterClientCommand.cs:144` e `InvoiceProrationService.cs:74,117`), **no** *"el día 5 del mes"* que es lo que usa `BillingService`.

Reutilizar `InvoiceDueDays` en `BillingService` habría sido un **bug semántico**, no una mejora. Hace falta un miembro nuevo con nombre distinto.

### 🟠 C5 — `FallbackPlanName` ya existe y nadie la usa

`AppConstants.Billing.FallbackPlanName = "—"` está definida y **no se usa en ningún sitio**. `PaymentService` tiene 10 literales `"—"` sueltos. F6.4 pasa de *"crear una constante"* a *"usar la que ya existe"*.

### 🟠 C6 — La búsqueda de clientes toca 8 columnas, no 4 — y dos son case-sensitive

`ClientProjectionHelpers.ApplyFullTextSearch` filtra por: `FullName`, `TbnCode`, `IdentityCard`, `WinboxNumber`, `PhoneMain`, `Zone`, `PhoneSecondary`, `Email`.

Y hay un detalle que la v1 no vio: **`PhoneMain` y `PhoneSecondary` usan `.Contains(q)` SIN `.ToLower()`**. Un índice `gin (lower(col))` **no se usaría** en esas dos. Necesitan expresión distinta.

### 🟡 C7 — `DatabaseFixture.cs` es código muerto

Ningún test lo referencia. La v1 decía *"verifica su imagen y cámbiala a PostGIS"* — inútil. El fixture real es `CustomWebApplicationFactory`, que **ya** usa `postgis/postgis:16-3.4-alpine`, hace `CREATE EXTENSION IF NOT EXISTS postgis` y construye el esquema con `EnsureCreatedAsync()`. Acción correcta: **borrar `DatabaseFixture.cs`**.

### 🟡 C8 — Los tests de integración NO ejercitan las migraciones

`CustomWebApplicationFactory` fija `SkipStartupMigration=true` y usa `EnsureCreatedAsync()`. Es decir, los tests corren contra el esquema **del modelo EF**, no contra el que producen las migraciones — que es el que hay en producción. **Los tests verdes no demuestran paridad de esquema.** Esto refuerza C1 y es la razón del nuevo paso F0.4.

### 🟡 C9 — Conteos corregidos

| Dato | v1 decía | Real |
|---|---|---|
| `AddScoped<IGenericRepository` | 41 | **44** |
| Migraciones | 65 | **63** (+ snapshot + `MigrationsDbContextLink.cs`) |
| Columnas en búsqueda de clientes | 4 | **8** |
| Jobs con `JobRunTracker` | 11 (implícito) | **4** |

### 🟢 C10 — Confirmado correcto en la v1

Build limpio (0 warnings), `SystemConfigKeys.TokenCleanupLastRunDay` existe, `DistributionBox.Ocupar()`/`PuertosOcupados` existen, `BaseController : ControllerBase`, `PropertyNamingPolicy = null` en `Program.cs:92`, cero Polly, `PaymentService.cs:121` con `30` literal, los 3 `UpdateAsync` sin transacción en `CompleteInstallationCommand`, y los 77 archivos de Application con EF Core.

---

## 2. Estado actual: inventario

| Métrica | Valor |
|---|---|
| Archivos `.cs` (sin migraciones) | 432 |
| Líneas totales | 19.402 |
| Domain / Application / Infrastructure / Presentation | 2.194 / 17.539 / 6.093 / 4.233 |
| Migraciones (escritas a mano, sin Designer) | 63 |
| Tests | ~711 (597 + 77 + 37) |
| Application con `using Microsoft.EntityFrameworkCore` | **77 de 204 (38%)** |
| `HasIndex` declarados | 77 |
| `BackgroundService` | 11 (solo 4 con tracker) |
| `AddScoped<IGenericRepository<T>>` manuales | 44 |
| Servicios sin interfaz | 24 |
| Controladores con clases concretas inyectadas | 14 de 33 |
| **Archivos frontend con campos en español** | **57** |
| **Archivos chatbot con campos en español** | **26** |
| **Archivos notifier leyendo columnas en español** | **7** |

### Lo que NO hay que tocar

- **`Domain/Services/`** — `PaymentReversalService`, `CreditReversalPolicy`, `InvoiceStatusResolver`, `PlanChangePolicy`, `BillingEligibility`, `SlaCalculator`, `InvoiceDomainService`. Funciones puras, testeadas. **Son el modelo a seguir.**
- **`Domain/ValueObjects/`** y **`Result<T>`**.
- **`RateLimitConfiguration.cs`** — particionado correcto.
- **Los comentarios de intención.** Lo que sobra son los que narran código **borrado** (F6.5).
- **El patrón Outbox** (`NotifOutbox` + worker Python).
- **`CreditMovement` + `ICreditLedger`** — libro mayor append-only, modelo para cualquier módulo con saldos.

---

# FASE 0 — Red de seguridad

> **Duración:** 5 días (era 3; +2 por el paso 0.4) · **Riesgo:** nulo · **Bloquea:** todo

## Paso 0.1 — Copia de seguridad (el repo NO está bajo git)

```bash
cp -r telecombolivianet-backend-develop "telecombolivianet-backend-develop.BACKUP-$(date +%Y%m%d)"
```

Y en serio: **inicializa git antes de empezar el plan.**

```bash
cd telecombolivianet-backend-develop
git init && git add -A && git commit -m "Baseline antes del plan de mejora técnica"
```

Sin control de versiones, ninguna de las fases siguientes tiene rollback real. Este paso vale más que cualquier otro del documento.

## Paso 0.2 — Arreglar el CI

`.github/workflows/ci.yml` compila **solo** el proyecto `Presentation` y luego corre `dotnet test --no-build` sobre **un** proyecto de test. Los 77 de integración y los 37 unitarios nunca se ejecutan.

```yaml
      - name: Restore dependencias
        run: dotnet restore Project-Telecom-Bolivianet.sln

      - name: Build (Release)
        run: dotnet build Project-Telecom-Bolivianet.sln --no-restore --configuration Release

      - name: Tests unitarios (dominio puro)
        run: dotnet test tests/TelecomBoliviaNet.UnitTests --no-build -c Release

      - name: Tests de servicios y handlers
        run: dotnet test tests/TelecomBoliviaNet.Tests --no-build -c Release --collect:"XPlat Code Coverage"

      - name: Tests de integración (Testcontainers + PostGIS)
        run: dotnet test tests/TelecomBoliviaNet.IntegrationTests --no-build -c Release
```

> El fixture de integración (`CustomWebApplicationFactory`) ya levanta `postgis/postgis:16-3.4-alpine` y crea la extensión. No hace falta tocarlo.

**Además:** borra `tests/TelecomBoliviaNet.IntegrationTests/Fixtures/DatabaseFixture.cs` — es código muerto (ningún test lo usa) y encima levanta `postgres:16-alpine` sin PostGIS, así que confunde a quien lo lea (**C7**).

## Paso 0.3 — Congelar la línea base

```bash
dotnet test Project-Telecom-Bolivianet.sln -c Release > baseline.txt 2>&1
```

Referencia para todas las fases: mismo número de tests pasando o más, **cero** regresiones.

## Paso 0.4 — 🆕 Reconciliar modelo ↔ migraciones (**C1, C8**)

**Este paso no existía en la v1 y es el que hace posibles F5 y F6.**

Hoy no tienes forma automática de saber si un refactor cambió el esquema, porque EF ya cree que faltan todas las tablas. Necesitas una fuente de verdad que no sea EF.

### 0.4.a — Capturar el esquema REAL de producción

```sql
-- Ejecutar contra la BD de producción (solo lectura). Guardar como docs/schema_produccion.txt
SELECT table_name, column_name, data_type,
       character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

Guarda también índices y constraints:

```sql
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' ORDER BY tablename, indexname;
```

### 0.4.b — Test que compara modelo EF contra esquema real

```csharp
/// <summary>
/// Guardia de paridad de esquema. Sustituye al HasPendingModelChanges() que NO
/// sirve en este proyecto: las migraciones están escritas a mano y el snapshot
/// de EF no refleja la base real, así que EF siempre reporta "cambios pendientes".
///
/// Este test no pregunta a EF qué cree: levanta un PostgreSQL limpio, aplica LAS
/// MIGRACIONES (no EnsureCreated), y compara columna a columna contra lo que el
/// modelo espera. Si un refactor rompe un mapeo, falla aquí.
/// </summary>
public class SchemaParityTests : IClassFixture<MigratedDatabaseFixture>
{
    [Fact]
    public async Task El_esquema_de_las_migraciones_coincide_con_el_modelo_EF()
    {
        var real     = await LeerColumnasDeInformationSchemaAsync(_fixture.Connection);
        var esperado = ColumnasDelModelo(_fixture.DbContext.Model);

        var faltantes = esperado.Except(real).OrderBy(x => x).ToList();
        var sobrantes = real.Except(esperado).OrderBy(x => x).ToList();

        faltantes.Should().BeEmpty("el modelo espera columnas que las migraciones no crean");
        // Las sobrantes se toleran al principio (columnas creadas por SQL manual):
        // se listan en un archivo de excepciones conocidas que SOLO puede encogerse.
        sobrantes.Except(ExcepcionesConocidas).Should().BeEmpty();
    }
}
```

Con un fixture nuevo que **sí** aplique migraciones:

```csharp
public class MigratedDatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _pg = new PostgreSqlBuilder()
        .WithImage("postgis/postgis:16-3.4-alpine").Build();

    public async Task InitializeAsync()
    {
        await _pg.StartAsync();
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(_pg.GetConnectionString(), o => o.UseNetTopologySuite()).Options;
        DbContext = new AppDbContext(options);
        await DbContext.Database.ExecuteSqlRawAsync("CREATE EXTENSION IF NOT EXISTS postgis;");
        await DbContext.Database.MigrateAsync();   // ← LAS MIGRACIONES, no EnsureCreated
    }
}
```

**Si `MigrateAsync()` falla**, ya has encontrado el problema: las migraciones no reconstruyen la base desde cero. Arréglalo escribiendo a mano las migraciones que faltan para las tablas creadas por SQL directo (`CoverageQueries`, `CreditMovements`, `GeocodeCaches`, `NapPorts`, `PortReservations`), con `IF NOT EXISTS` para que sean inocuas en producción.

### 0.4.c — Congelar el snapshot

Cuando 0.4.b esté verde, regenera el snapshot **una vez** para que refleje la realidad:

```bash
# SIN --no-build. Nunca con --no-build (C2).
cp -r src/TelecomBoliviaNet.Infrastructure/Migrations Migrations.BACKUP
dotnet ef migrations add ReconciliacionEsquema \
  -p src/TelecomBoliviaNet.Infrastructure -s src/TelecomBoliviaNet.Presentation
```

Revisa el `Up()` generado. Todo lo que ya exista en producción, **conviértelo en `IF NOT EXISTS`** o vacíalo. El objetivo no es cambiar la base: es que el snapshot quede alineado.

> **Alternativa si esto se complica:** salta 0.4.c y quédate solo con el test de paridad de 0.4.b. Es red suficiente para F5 y F6, y no toca las migraciones. **Recomendado si tienes prisa.**

## Paso 0.5 — Tests de caracterización de los 5 flujos críticos

Congelan el comportamiento **actual**, no el correcto.

| Test | Qué congela | Protege |
|---|---|---|
| `BillingCharacterizationTests` | Facturar un mes con cliente activo, suspendido y con saldo a favor | F4, F5 |
| `PaymentVoidCharacterizationTests` | Anular pago que cubre 2 facturas, una con otro pago vivo | F3, F5 |
| `AutoSuspendCharacterizationTests` | Job con 5 clientes (1 pagó recién, 1 ya suspendido, 3 morosos) | F2 |
| `PlanChangeCharacterizationTests` | Upgrade y downgrade: fecha efectiva, ticket, prorrateo | F5 |
| `InstallationCompleteCharacterizationTests` | Completar con caja reservada: estado, ticket, puerto | F3 |

> **Regla de oro:** si al escribirlos descubres un bug, **NO lo arregles aquí**. Anótalo en `BUGS_DESCUBIERTOS.md` y congela el comportamiento actual.

## Criterio de salida

- [ ] Repo bajo git con commit baseline
- [ ] CI ejecuta los 3 proyectos, verde
- [ ] `DatabaseFixture.cs` borrado
- [ ] `baseline.txt` guardado
- [ ] **Test de paridad de esquema verde** (0.4.b) ← el que desbloquea F5 y F6
- [ ] 5 tests de caracterización verdes
- [ ] `BUGS_DESCUBIERTOS.md` creado

---

# FASE 1 — Higiene sin riesgo

> **Duración:** 2 días · **Riesgo:** muy bajo

## Paso 1.1 — Registro genérico de repositorios

`DependencyInjection.cs:91-144`: **44 líneas** registrando `IGenericRepository<T>` una por una (**C9**).

```csharp
private static IServiceCollection AddRepositories(this IServiceCollection services)
{
    // Registro abierto: cualquier IGenericRepository<T> se resuelve sin tocar este
    // archivo. Antes había 44 registros manuales y añadir una entidad obligaba a editar aquí.
    services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));
    services.AddScoped<IScheduleRepository, ScheduleRepository>();
    return services;
}
```

⚠️ El fallo de este cambio aparece **en runtime**, no al compilar. Test obligatorio:

```csharp
[Fact]
public void Todos_los_controladores_se_construyen()
{
    using var scope = _factory.Services.CreateScope();
    foreach (var t in typeof(Program).Assembly.GetTypes()
                 .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract))
    {
        var act = () => ActivatorUtilities.CreateInstance(scope.ServiceProvider, t);
        act.Should().NotThrow($"{t.Name} debe poder construirse");
    }
}
```

## Paso 1.2 — Constante duplicada de anulación

`PaymentService.cs:121` usa `30` literal; `:162` usa `AppConstants.Security.VoidPaymentWindowDays`. Si cambias la constante, la UI muestra "Anular" cuando el backend ya rechaza.

```csharp
var canVoid = (DateTime.UtcNow - p.RegisteredAt).TotalDays
              <= AppConstants.Security.VoidPaymentWindowDays;
```

## Paso 1.3 — Día de vencimiento hardcodeado (**corregido por C4**)

`BillingService.cs:85` y `:170` usan `new DateTime(y, m, 5, …)`.

⚠️ **NO reutilices `AppConstants.Time.InvoiceDueDays`.** Ya existe y vale 5, pero significa *"5 días desde hoy"* (`now.AddDays(5)`), no *"el día 5 del mes"*. Reutilizarla sería un bug semántico.

`AppConstants.Billing` **ya existe** — se le añade un miembro:

```csharp
public static class Billing
{
    public const int    DecimalPlaces    = 2;
    public const string FallbackPlanName = "—";

    /// <summary>
    /// Día del mes en que vence la mensualidad. OJO: distinto de Time.InvoiceDueDays,
    /// que son "días a partir de hoy" para facturas de instalación.
    /// </summary>
    public const int DueDayOfMonth = 5;
}
```

> **Deuda a resolver:** existe además `SystemConfig["ISP:FechaCorte"]`. Decide cuál manda (lo correcto: la constante como default, `SystemConfig` la sobreescribe) o al menos deja un comentario y una entrada en `BUGS_DESCUBIERTOS.md`.

## Paso 1.4 — Interfaces para los 24 servicios sin ella

`AuthService`, `AuditService`, `AuditLogService`, `JwtTokenService`, `RefreshTokenService`, `PlanService`, `InvoiceOperationsService`, `BusinessScheduleService`, `TicketHelper`, `TicketBalancingService`, `TicketAttachmentService`, `TicketNumberService`, `ClientHistoryService`, `ClientQrService`, `CompanyQrService`, `AdminSettingsService`, `NotifConfigService`, `NotifSendService`, `NotifHistoryService`, `NotifTemplateService`, `NotifSegmentService`, `NotifTriggerService`, `NotifContextBuilderService`, `InvoiceProrationService`, `TechnicianAssignmentService`, `InstallationPhotoService`.

Uno por PR. Y elimina el doble registro donde ya existe:

```csharp
// ANTES                                          // DESPUÉS
services.AddScoped<PaymentService>();             services.AddScoped<IPaymentService, PaymentService>();
services.AddScoped<IPaymentService>(sp =>
    sp.GetRequiredService<PaymentService>());
```

## Criterio de salida

- [ ] `AddRepositories()` de 44 líneas a 3, con test de resolución verde
- [ ] Cero `30` y cero `5` mágicos en `PaymentService`/`BillingService`
- [ ] ≥10 de los 24 servicios con interfaz
- [ ] Suite verde vs `baseline.txt` · Desplegado y verificado

---

# FASE 2 — Escalabilidad: coordinación de jobs

> **Duración:** 4 días · **Riesgo:** medio · **Escalabilidad 5 → 8**

## El problema (corregido por C3)

`JobSchedule.cs:59-76` — `JobRunTracker` hace leer → decidir → **ejecutar** → marcar, y marca **al final**:

```
t=0    Réplica A: lee lastRun=ayer → ejecuta
t=0    Réplica B: lee lastRun=ayer → ejecuta      ← nadie se lo impide
t=0-5  Ambas facturan / suspenden / envían WhatsApp
t=5    Ambas marcan lastRun=hoy
```

**Pero solo 4 de los 11 jobs usan este mecanismo.** Los otros 7 son bucles de timer con flags de idempotencia por registro (ver tabla en C3). Trátalos distinto:

- **Grupo A (4 jobs con tracker)** — el lease debe envolver **la lectura del tracker también**.
- **Grupo B (4 jobs con flag por registro: Sla, Reminders, QrExpiry, CompanyQr)** — el lease evita la carrera del flag.
- **Grupo C (3 idempotentes: AutoClose, ExpirePortReservations, NapPortSync)** — el lease es opcional; solo ahorra trabajo duplicado.

## Paso 2.1 — `JobLease` con advisory lock

Patrón que ya usas en el notifier Python.

```csharp
namespace TelecomBoliviaNet.Infrastructure.Jobs;

/// <summary>
/// Exclusión mutua entre réplicas apoyada en los advisory locks de PostgreSQL.
///
/// pg_try_advisory_lock es NO bloqueante y está atado a la SESIÓN: si el contenedor
/// muere a mitad, PostgreSQL libera el lock al cerrarse la conexión. Sin TTL ni limpieza.
/// </summary>
public static class JobLease
{
    public static async Task<bool> TryRunExclusiveAsync(
        AppDbContext db, string jobKey, Func<Task> work, CancellationToken ct = default)
    {
        long lockId = StableHash(jobKey);

        // El lock vive en la SESIÓN, así que la conexión debe seguir abierta durante
        // todo el trabajo. EF la abre y cierra por comando: la abrimos explícitamente.
        var conn = db.Database.GetDbConnection();
        var wasClosed = conn.State != System.Data.ConnectionState.Open;
        if (wasClosed) await conn.OpenAsync(ct);

        try
        {
            if (!await ExecLockAsync(conn, "SELECT pg_try_advisory_lock(@id)", lockId, ct))
                return false;
            try { await work(); return true; }
            finally { await ExecLockAsync(conn, "SELECT pg_advisory_unlock(@id)", lockId, ct); }
        }
        finally { if (wasClosed) await conn.CloseAsync(); }
    }

    private static async Task<bool> ExecLockAsync(
        System.Data.Common.DbConnection conn, string sql, long id, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        var p = cmd.CreateParameter(); p.ParameterName = "@id"; p.Value = id;
        cmd.Parameters.Add(p);
        return (bool)(await cmd.ExecuteScalarAsync(ct))!;
    }

    /// <summary>
    /// FNV-1a 64. NO usar GetHashCode(): en .NET Core el hash de string está
    /// aleatorizado por proceso, así que dos réplicas calcularían IDs distintos
    /// y el lock no serviría de nada.
    /// </summary>
    private static long StableHash(string s)
    {
        unchecked
        {
            ulong hash = 14695981039346656037;
            foreach (var c in s) { hash ^= c; hash *= 1099511628211; }
            return (long)hash;
        }
    }
}
```

## Paso 2.2 — Aplicarlo, por grupos

**Grupo A** — el tracker va **dentro** del lock (si lo dejas fuera, no has arreglado nada):

```csharp
var ran = await JobLease.TryRunExclusiveAsync(db, nameof(AutoSuspendClientJob), async () =>
{
    var lastRunDay = await JobRunTracker.ReadLastRunAsync(
        db, SystemConfigKeys.AutoSuspendLastRunDay, ct);
    if (!JobSchedule.ShouldRunDaily(DateTime.UtcNow, lastRunDay,
            AppConstants.Time.AutoSuspendRunHour, AppConstants.Time.AutoSuspendRunMinute))
        return;

    await RunAsync(ct);
    await JobRunTracker.MarkRanAsync(db, SystemConfigKeys.AutoSuspendLastRunDay,
                                     JobSchedule.DayKey(DateTime.UtcNow), ct);
}, ct);

if (!ran) _logger.LogDebug("{Job}: otra instancia tiene el lease, se omite el tick.", nameof(AutoSuspendClientJob));
```

**Grupos B y C** — solo envuelven el cuerpo, sin tracker:

```csharp
await JobLease.TryRunExclusiveAsync(db, nameof(SlaAlertJob), () => RunAsync(ct), ct);
```

**Orden de migración (riesgo creciente):**
`TokenCleanupJob` → `ExpirePortReservationsJob` → `NapPortSyncJob` → `AutoCloseTicketJob` → `QrExpiryAlertJob` → `CompanyQrExpiryAlertJob` → `SlaAlertJob` → `SendInstallationRemindersJob` → `ApplyScheduledPlanChangesJob` → `AutoSuspendClientJob` → `BillingBackgroundJob`.

## Paso 2.3 — Tests

```csharp
[Fact]
public async Task Dos_instancias_no_ejecutan_el_mismo_job_a_la_vez()
{
    await using var db1 = NewContext();   // dos DbContext = dos sesiones = dos réplicas
    await using var db2 = NewContext();
    var ejecuciones = 0;
    var dentro = new TaskCompletionSource(); var suelta = new TaskCompletionSource();

    var t1 = JobLease.TryRunExclusiveAsync(db1, "test-job", async () =>
    { Interlocked.Increment(ref ejecuciones); dentro.SetResult(); await suelta.Task; });

    await dentro.Task;
    var t2 = await JobLease.TryRunExclusiveAsync(db2, "test-job",
        () => { Interlocked.Increment(ref ejecuciones); return Task.CompletedTask; });

    suelta.SetResult();
    (await t1).Should().BeTrue();
    t2.Should().BeFalse();
    ejecuciones.Should().Be(1);
}

[Fact]
public async Task El_lock_se_libera_si_el_trabajo_lanza()
{
    await using var db1 = NewContext(); await using var db2 = NewContext();
    var act = () => JobLease.TryRunExclusiveAsync(db1, "job-2", () => throw new InvalidOperationException());
    await act.Should().ThrowAsync<InvalidOperationException>();
    (await JobLease.TryRunExclusiveAsync(db2, "job-2", () => Task.CompletedTask)).Should().BeTrue();
}
```

## Paso 2.4 — Verificación real

```bash
docker compose up -d --scale backend=2
docker compose logs -f backend | grep -i lease
# Esperado: una ejecuta, la otra registra "otra instancia tiene el lease"
```

## Criterio de salida

- [ ] `JobLease` con 2 tests verdes
- [ ] Grupo A con el tracker **dentro** del lock; grupos B y C envueltos
- [ ] Prueba con `--scale backend=2` sin duplicados
- [ ] Suite verde · Observado un ciclo diario completo en producción

---

# FASE 3 — Contrato de repositorio y Unit of Work

> **Duración:** 1 semana · **Riesgo:** medio-alto · **Bloquea:** F4, F5

## El problema

| Método | ¿`SaveChanges()` oculto? |
|---|---|
| `AddAsync`, `AddRangeAsync`, `MarkModifiedAsync` | ❌ No |
| `UpdateAsync`, `UpdateRangeAsync`, `DeleteAsync`, `DeleteRangeAsync` | ✅ **Sí, oculto** |

`CompleteInstallationCommand.cs:60-86` → **3 `UpdateAsync` = 3 transacciones**. Si falla la tercera: puerto ocupado + instalación completada + **ticket abierto para siempre**.

## Paso 3.1 — Contrato explícito (aditivo)

```csharp
public interface IGenericRepository<T> where T : Entity
{
    // ── Lectura ──
    Task<T?> GetByIdAsync(Guid id);
    IQueryable<T> GetAll();
    IQueryable<T> GetAllReadOnly();
    Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate);
    Task<bool> AnyAsync(Expression<Func<T, bool>> predicate);
    Task<int> CountAsync(Expression<Func<T, bool>> predicate);
    Task<List<T>> ListAsync(Expression<Func<T, bool>>? predicate = null);
    Task<List<T>> ListReadOnlyAsync(Expression<Func<T, bool>>? predicate = null);

    // ── Escritura: NINGUNO persiste. Hay que llamar a SaveChangesAsync. ──
    Task AddAsync(T entity);
    Task AddRangeAsync(IEnumerable<T> entities);
    void Update(T entity);
    void UpdateRange(IEnumerable<T> entities);
    void Remove(T entity);
    void RemoveRange(IEnumerable<T> entities);

    Task SaveChangesAsync();

    // ── OBSOLETOS ──
    [Obsolete("Persiste por su cuenta y rompe la transacción del llamador. Usa Update() + SaveChangesAsync().")]
    Task UpdateAsync(T entity);
    [Obsolete("Persiste por su cuenta. Usa UpdateRange() + SaveChangesAsync().")]
    Task UpdateRangeAsync(IEnumerable<T> entities);
    [Obsolete("Persiste por su cuenta. Usa Remove() + SaveChangesAsync().")]
    Task DeleteAsync(Guid id);
    [Obsolete("Persiste por su cuenta. Usa RemoveRange() + SaveChangesAsync().")]
    Task DeleteRangeAsync(IEnumerable<T> entities);
}
```

Nada se rompe: los viejos siguen funcionando, solo avisan.

```bash
dotnet build 2>&1 | grep CS0618 | sort | uniq -c | sort -rn   # tu lista de trabajo
```

## Paso 3.2 — Migrar por módulo

Coverage → Installations → Tickets → Users → Clients → Payments → Invoices.

## Paso 3.3 — Transacción donde faltaba

Este paso **sí cambia comportamiento** (a mejor). PR propio, con la caracterización de F0 como red.

```csharp
await _uow.BeginTransactionAsync(ct);
try
{
    if (cmd.Dto.DistributionBoxId is null && inst.DistributionBoxId is Guid reservedBoxId)
    {
        var box = await _boxRepo.GetByIdAsync(reservedBoxId);
        if (box is not null) { box.Ocupar(); _boxRepo.Update(box); }
    }

    inst.EquipoOnuSerial = cmd.Dto.EquipoOnuSerial?.Trim();
    inst.Status = InstallationStatus.Completada;
    _instRepo.Update(inst);

    if (inst.Ticket is not null && inst.Ticket.Status is TicketStatus.Abierto or TicketStatus.EnProceso)
    {
        inst.Ticket.Status = TicketStatus.Resuelto;
        _ticketRepo.Update(inst.Ticket);
    }

    await _instRepo.SaveChangesAsync();   // un único commit para los tres
    await _uow.CommitAsync(ct);
}
catch (Exception ex)
{
    await _uow.RollbackAsync(ct);
    _logger.LogError(ex, "Error al completar la instalación {Id} — sin cambios aplicados", cmd.InstalacionId);
    return Result.Failure("No se pudo completar la instalación. No se aplicó ningún cambio.");
}
```

> **Ojo con el test:** `DistributionBox.Ocupar()` **consume una reserva si existe** (`PuertosReservados--` y `PuertosOcupados++`). Al verificar el rollback, comprueba **ambos** contadores, no solo `PuertosOcupados`.

## Paso 3.4 — Auditar el resto

```bash
cd src/TelecomBoliviaNet.Application
grep -rl "UpdateAsync\|AddAsync" --include=*.cs . | while read f; do
  n=$(grep -c "UpdateAsync\|AddAsync\|DeleteAsync" "$f")
  u=$(grep -c "_uow\|BeginTransaction" "$f")
  if [ "$n" -gt 1 ] && [ "$u" -eq 0 ]; then echo "REVISAR ($n escrituras, 0 transacción): $f"; fi
done
```

## Paso 3.5 — Borrar los obsoletos cuando no queden `CS0618`

## Criterio de salida

- [ ] Contrato con separación lectura/escritura/persistencia · Cero `CS0618` · Obsoletos eliminados
- [ ] Todo handler con >1 escritura: transacción o comentario justificando
- [ ] Test de atomicidad de `CompleteInstallationCommand` (ambos contadores de la caja)
- [ ] Suite + caracterización sin cambios

---

# FASE 4 — DIP: sacar EF Core de Application

> **Duración:** 3 semanas · **Riesgo:** alto · **SOLID 5.5 → 7.5**

**77 de 204 archivos** de Application usan EF Core. Causa raíz: `GetAll()` devuelve `IQueryable<T>`.

## Decisión de alcance

| Nivel | Qué | Esfuerzo | ¿Recomendado? |
|---|---|---|---|
| **A — Pragmático** | Bajar a ≤30 archivos. `IQueryable` solo en lecturas complejas, documentado | 3 semanas | ✅ **Sí** |
| **B — Purista** | Cero EF en Application | 8-10 semanas | ❌ No |

Se implementa **A**, documentado como `ADR-001`. Un refactor de 10 semanas que se queda a medias deja tres arquitecturas en vez de dos.

## Paso 4.1 — Repositorios específicos por agregado

```csharp
public interface IClientRepository : IGenericRepository<Client>
{
    Task<Client?> GetWithPlanAsync(Guid id, CancellationToken ct = default);
    Task<List<Client>> GetBillableWithPlanAsync(DateTime installedBefore, CancellationToken ct = default);
    Task<List<Client>> GetWithOverdueInvoicesAsync(CancellationToken ct = default);
    Task<List<Client>> GetSuspendableBatchAsync(
        DateTime overdueBefore, IReadOnlyCollection<Guid> excludeIds, int take, CancellationToken ct = default);
    Task<bool> ExistsWinboxAsync(string winbox, Guid? exceptClientId = null, CancellationToken ct = default);
}
```

Implementación en Infrastructure (que es donde EF debe vivir). Registro **después** del genérico para que gane:

```csharp
services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));
services.AddScoped<IClientRepository, ClientRepository>();
```

## Paso 4.2 — Migrar módulo a módulo

Coverage → Users → Installations → Tickets → Clients → Invoices → Payments.

```csharp
// ANTES                                        // DESPUÉS
using Microsoft.EntityFrameworkCore;            var client = await _clientRepo.GetWithPlanAsync(cmd.ClientId, ct);
var client = await _clientRepo.GetAll()
    .Include(c => c.Plan)
    .FirstOrDefaultAsync(c => c.Id == cmd.ClientId, ct);
```

Anota el progreso en cada commit: `"Coverage: 77 → 71"`.

## Paso 4.3 — El beneficio visible

```csharp
var repo = new Mock<IClientRepository>();
repo.Setup(r => r.GetWithPlanAsync(_clientId, It.IsAny<CancellationToken>()))
    .ReturnsAsync(TestEntityFactory.ClientActivo(_clientId));   // ← una línea, sin MockQueryable
```

Menos andamiaje, tests más rápidos. **Este es el argumento para el documento de grado**, no la pureza en abstracto.

## Paso 4.4 — Lo que se queda (documentar en ADR-001)

- Reportes con agregación en SQL (`GetCollectionReportAsync`): optimización deliberada.
- Handlers de `Infrastructure/Services/Dashboard/`: ya están en su capa correcta.

## Criterio de salida

- [x] 5 repositorios específicos · EF en Application de 77 a **≤30** archivos
      → **18 repositorios, 77 → 29 archivos** (2026-08-25)
- [x] `ADR-001` escrito · ≥5 tests sin `MockQueryable`
      → `docs/adr/ADR-001-ef-core-en-application.md`; `SpecificRepoMock` cubre
      los 18 repositorios y sustituye a `MockQueryable` en todos sus tests
- [x] Suite + caracterización sin cambios
      → 943 tests verdes, más 28 de integración nuevos contra PostgreSQL real
      para las traducciones a SQL que un mock no comprueba

### Lo que quedó fuera, documentado en el ADR

| Qué | Cuántos | Motivo |
|---|---|---|
| Informes con agregación en SQL | 4 | Filtros dinámicos; un método por combinación sería peor |
| Captura de `DbUpdateConcurrencyException` | 5 | Solo el tipo de la excepción; 2 ya no tienen consultas |
| Configuración e infraestructura | ~20 | No son reglas de negocio; entran en F5 |

---

# FASE 5 — SRP: partir los servicios grandes

> **Duración:** 2 semanas · **Riesgo:** medio · **Depende de:** F0.4, F3

| Clase | Líneas | Responsabilidades |
|---|---|---|
| `PaymentService` | 545 | Consultas · anulación · 2 reportes · recordatorios · mapeo |
| `BillingService` | 421 | Backfill · preview · facturación · vencidas · anulación · prorrateo |
| `InvoiceQueryService` | 419 | Consultas + proyecciones + agregados |
| `PlanChangeService` | 386 | Solicitud · aprobación · rechazo · aplicación (**12 dependencias**) |
| `BotProxyService` | 332 | Proxy HTTP (**11 `catch (Exception)`**) |
| `NotifConfigService` | 152 | **16 métodos públicos** |
| `AppDbContext` | 842 | Mapeo de 50+ entidades |

## Método: Extract Class con delegación temporal

```
1. Crear la clase nueva con el código movido (copiar, no cortar)
2. La clase vieja DELEGA en la nueva
3. Compilar + suite verde        ← el 90% del riesgo ya está superado
4. Migrar llamadores uno a uno
5. Borrar el delegador
```

Entre 2 y 5 el sistema es plenamente funcional. Si te quedas sin tiempo, paras en 3.

## Paso 5.1 — `PaymentService` → 5 clases

```
Application/Payments/
├── Queries/PaymentQueries.cs        ← GetAll, GetById, CheckDuplicate
├── Commands/VoidPaymentCommand.cs   ← VoidPayment + BuildCreditReversal
├── Reports/PaymentReportService.cs  ← los 2 reportes de recaudación
├── Commands/SendOverdueRemindersCommand.cs
└── PaymentMapper.cs
```

Conviértelos en handlers MediatR — el patrón que ya usan `Clients/Commands` e `Installations/Commands`. Así **eliminas una de las dos arquitecturas** en vez de crear una tercera.

## Paso 5.2 — `BillingService` → 5 clases + dominio

Extrae al dominio lo que ya es lógica pura:

```csharp
// Domain/Services/ProrationCalculator.cs
// Era un método privado estático de BillingService. Es una regla pura (sin BD, sin
// reloj del sistema): su sitio es el dominio, donde se testea sin montar un servicio
// con 8 dependencias.
public static class ProrationCalculator
{
    public static (decimal Amount, string? Notes) FirstMonth(
        decimal monthlyPrice, DateTime installDate, int year, int month)
    {
        if (installDate.Year != year || installDate.Month != month)
            return (monthlyPrice, null);

        int daysInMonth   = DateTime.DaysInMonth(year, month);
        int remainingDays = daysInMonth - installDate.Day + 1;
        return (Math.Round(monthlyPrice * remainingDays / daysInMonth, 2),
                $"Mes proporcional: {remainingDays} de {daysInMonth} días");
    }
}
```

```csharp
[Theory]
[InlineData(100, 2026, 3, 15, 54.84)]   // 17 de 31 días
[InlineData(100, 2026, 3,  1, 100.00)]
[InlineData(100, 2026, 2, 28,  3.57)]
public void Prorrateo_del_primer_mes(decimal precio, int y, int m, int dia, decimal esperado)
    => ProrationCalculator.FirstMonth(precio, new DateTime(y, m, dia), y, m)
        .Amount.Should().Be(esperado);
```

## Paso 5.3 — `PlanChangeService`: 12 dependencias → 4 handlers

Doce dependencias es la señal más clara de SRP roto del proyecto.

⚠️ Tiene **4 `catch (Exception)`**. Al partirlo, revisa uno por uno qué traga cada uno — es fácil perder un caso en la mudanza.

## Paso 5.4 — `AppDbContext` (842 → ~60 + 50 configs)

El patrón ya existe: `Data/Config/VisitTechnicianConfig.cs`, `InstallationTechnicianConfig.cs`.

```csharp
// AppDbContext.cs queda así
protected override void OnModelCreating(ModelBuilder mb)
    => mb.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
```

> ⚠️ **Protocolo CORREGIDO (C1).** La v1 decía *"genera una migración; debe salir vacía"*. **Eso no funciona en este proyecto**: las migraciones están escritas a mano y EF ya reporta deriva, así que la migración nunca sale vacía y no te dice nada.
>
> **La red de seguridad correcta es el test de paridad de esquema de F0.4.b**, que compara el modelo EF contra `information_schema` tras aplicar las migraciones reales.

```bash
# Por cada entidad movida:
#  1. Mover el bloque de OnModelCreating a su IEntityTypeConfiguration<T>
#  2. dotnet build
#  3. dotnet test --filter "FullyQualifiedName~SchemaParity"   ← el guardia real
#  4. Si falla: has perdido un mapeo. Búscalo antes de seguir.
```

Son 50 iteraciones de 2 minutos. Es tedioso, y es lo que separa un refactor seguro de una pérdida de datos.

## Criterio de salida

- [ ] Ninguna clase de Application > **250 líneas** · Ningún constructor > **6 dependencias**
- [ ] `AppDbContext` ≤ 100 líneas · 50 archivos en `Data/Config/`
- [ ] **Test de paridad de esquema verde tras cada entidad movida**
- [ ] Cero delegadores `[Obsolete]` · Suite + caracterización sin cambios

### Avance (2026-08-26)

Clases de Application > 250 líneas: **9 → 6**. Peor constructor: **12 → 12**
(queda `CreateInstallationCommand`).

> ⚠️ **La métrica "constructores > 6" engaña.** Subió de 16 a 17 mientras el
> código mejoraba: partir una clase de 12 dependencias en dos de 8 y 7 añade una
> clase por encima del umbral y quita una muy por encima. Lo que hay que mirar es
> **el peor constructor** y **cuántas responsabilidades** tiene cada clase, no
> cuántas cruzan una línea arbitraria.

Medir con `python scripts/contar-dependencias.py` — contar las comas del
constructor a ojo se salta el último parámetro, y así reporté 9 y 6 donde eran
10 y 7 en el commit `F5 (1/n)`.

| Hecho | Resultado |
|---|---|
| `PaymentService` | 565 → 230 líneas · 12 → 10 deps · + 5 clases nuevas |
| `BillingService` | 458 → 249 líneas · 8 → 7 deps · + `InvoiceBackfillService`, `InvoiceStatusService` |
| `ProrationCalculator` al dominio | 12 tests de tabla, sin montar ningún servicio |
| `PlanChangeService` | 362 → 197 líneas · 12 → 7 deps · + `PlanChangeRequestService` (8), `PlanChangeQueryService` (1), `PlanChangeNotifier` (3) |
| `AppDbContext` (paso 5.4) | 847 → **102** líneas · 45 configuraciones nuevas en `Data/Config/` (47 con las dos que ya existían) |
| `PaymentCreditService` | 344 → 257 líneas · 12 → 11 deps · + `PaymentAllocator` (2), `CreditRefundService` (3) |
| `BotProxyService` | 332 líneas y una interfaz de 11 métodos → `BotMonitorProxy` (193), `BotOutboundProxy` (75), `BotRagProxy` (63) sobre `BotProxyBase` (66), con tres interfaces segregadas |
| `InvoiceQueryService` | 419 → `InvoiceQueryService` (72), `InvoiceStatsService` (111), `InvoiceReportService` (243) y `InvoiceProjections` (57); `ApplyTypeFilter` sube al dominio |
| `InvoiceOperationsService` | 281 → 172 · + `ExtraordinaryInvoiceService` (96), `InvoiceCreditService` (81); 7 → 4 deps |
| `AuthService` | 255 → 194 · + `SessionService` (89), `PasswordChangeService` (68); `LoginLockoutPolicy` sube al dominio con 13 tests de tabla |

#### Cómo se verificó la mudanza del mapeo

`SchemaParityTests` compara tablas y columnas contra `information_schema`, pero
**no ve** los filtros globales de borrado lógico, las conversiones de enum a
texto, los índices únicos ni los valores por defecto. Perder un
`HasQueryFilter(c => !c.IsDeleted)` al mover un bloque no habría roto ningún test
y en cambio haría aparecer clientes dados de baja en todas las pantallas.

Así que se comparó el **modelo de EF completo**, volcado a texto con
`ModelDumpTests`, antes y después de la mudanza:

```bash
TBN_MODEL_DUMP=/tmp/modelo_nuevo.txt dotnet test ... --filter ModelDumpTests
git stash && TBN_MODEL_DUMP=/tmp/modelo_viejo.txt dotnet test ... && git stash pop
diff /tmp/modelo_viejo.txt /tmp/modelo_nuevo.txt
```

888 líneas de modelo, **idénticas**. Las semillas se contaron aparte (el modelo
en ejecución no las conserva): 31 filas antes y después.

`ModelDumpTests` se queda en el repositorio: **F6 lo va a necesitar**, porque
renombrar entidades y propiedades al inglés es exactamente el cambio que puede
mover una columna sin que nadie se entere.

Pendiente: `CreateInstallationCommand` (12 deps) y `RegisterClientCommand`
(11 deps).

De las nueve clases de Application que superaban las 250 líneas al empezar F5
quedan **dos**: `InvoiceDtos` (259), que es un fichero de records y no un
servicio, y `PaymentCreditService` (257), cuya operación es una sola transacción
y ya se explicó por qué no se parte más.

#### Por qué se partió el proxy del chatbot, que no era una god-class

Es un adaptador delgado sobre un solo servicio, así que el criterio de líneas no
era el argumento. El argumento fue **ISP**: una interfaz de once métodos que
inyectaban cinco consumidores, y **cuatro de ellos usaban exactamente uno**.
`UpdateClientCommand` dependía de once métodos para invalidar una identidad.

De paso, los once `catch (Exception)` idénticos —con su motivo escrito en uno
solo— pasan a una única política en `BotProxyBase.SinRomperElPanelAsync`.
Ver OBS-02: esa política colapsa "el bot dijo que no" con "el bot no responde",
y ahora arreglarlo sería una edición en vez de once.

---

# FASE 6 — Idioma inglés en los 4 servicios

> **Duración:** 3–4 semanas · **Riesgo:** ALTO · **Toca 3 repositorios**
> **Depende de:** F0.4 (paridad de esquema), F5 (no renombrar dos veces)

> **Decisión del usuario (2026-08-20): inglés TOTAL** — entidades, DTOs y contrato de API.
> La v1 proponía dejar los DTOs en español; queda descartado.

## El radio de impacto real

| Capa | Alcance medido | Rompe si cambia |
|---|---|---|
| Entidades C# (9 clases) | `Installation`, `NotifOutbox`, `NotifConfig`, `NotifLog`, `NotifSegment`, `NotifTemplate`, `CoverageZone`, `DistributionBox`, `ClientAttachment`, `TicketAttachment`, `TicketVisit`, `Plan` | Nada externo (no se serializan) |
| **Columnas de BD** | ~40 columnas en español | 🔴 **El notifier Python (7 archivos) lee por SQL directo** |
| **DTOs** (12 archivos, ~160 campos) | `InstallationDtos`, `TicketDtos`, `ClientDtos`, `InvoiceDtos`, `CoverageDtos`, `NotificationDtos`, `DashboardDtos`, `PlanChangeDtos`, `BotConfigDtos`, `AuthDtos`, `CompanyProfileDto`, `ReportContext` | 🔴 **Frontend (57 archivos) + chatbot (26 archivos)** |

Total: **~90 archivos fuera del backend**. Esto no es un refactor, es una migración de contrato entre 4 servicios.

## Estrategia: transición con doble campo (sin big-bang)

Cambiar los 4 servicios a la vez y desplegar de golpe es la receta para un fin de semana perdido. En su lugar, **la API sirve los dos nombres a la vez durante la transición**.

```
Etapa 1  Backend: entidades en inglés, columnas intactas (solo C#)
Etapa 2  Backend: DTOs con AMBOS campos (español + inglés). API compatible hacia atrás.
Etapa 3  Frontend migra a los campos en inglés. Chatbot migra a los campos en inglés.
Etapa 4  Backend: eliminar los campos en español de los DTOs.
Etapa 5  (Opcional) Renombrar columnas de BD + notifier, en lockstep.
```

**En ningún momento el sistema queda roto**, y cada etapa se despliega por separado.

### Etapa 1 — Entidades en inglés (backend solo, invisible fuera)

```csharp
// Domain/Entities/Installations/Installation.cs
public DateTime  ScheduledDate    { get; set; }   // era Fecha
public TimeOnly  StartTime        { get; set; }   // era HoraInicio
public int       DurationMin      { get; set; }   // era DuracionMin
public string    Address          { get; set; }   // era Direccion
public string?   Notes            { get; set; }   // era Notas
public string?   CancellationReason { get; set; } // era MotivoCancelacion
public string?   CancelledBy      { get; set; }   // era CanceladoPor
public DateTime? CancelledAt      { get; set; }   // era CanceladoAt
public DateTime  CreatedAt        { get; set; }   // era CreadoAt
public DateTime? UpdatedAt        { get; set; }   // era ActualizadoAt
public Guid      CreatedByUserId  { get; set; }   // era CreadoPorId
```

```csharp
// Infrastructure/Data/Config/InstallationConfig.cs — la BD NO cambia todavía
e.Property(i => i.ScheduledDate)     .HasColumnName("Fecha");
e.Property(i => i.StartTime)         .HasColumnName("HoraInicio");
e.Property(i => i.DurationMin)       .HasColumnName("DuracionMin");
e.Property(i => i.Address)           .HasColumnName("Direccion");
e.Property(i => i.Notes)             .HasColumnName("Notas");
e.Property(i => i.CancellationReason).HasColumnName("MotivoCancelacion");
e.Property(i => i.CancelledBy)       .HasColumnName("CanceladoPor");
e.Property(i => i.CancelledAt)       .HasColumnName("CanceladoAt");
e.Property(i => i.CreatedAt)         .HasColumnName("CreadoAt");
e.Property(i => i.UpdatedAt)         .HasColumnName("ActualizadoAt");
e.Property(i => i.CreatedByUserId)   .HasColumnName("CreadoPorId");
```

**Cómo:** *Rename* del IDE (F2), nunca buscar-y-reemplazar. El compilador encuentra el 100% de los usos.
**Verificación:** test de paridad de esquema de F0.4.b + un test de integración que lee y escribe la entidad contra PostgreSQL real.

### Etapa 2 — DTOs con ambos nombres

```csharp
public class CreateInstallationDto
{
    // ── Nombres nuevos (inglés) ──
    public string  ScheduledDate { get; set; } = string.Empty;
    public string  StartTime     { get; set; } = string.Empty;
    public string  Address       { get; set; } = string.Empty;
    public string? Notes         { get; set; }

    // ── Compatibilidad: se eliminan en la Etapa 4 (ver ADR-003) ──
    // Se mantienen para que el frontend y el chatbot puedan migrar por separado,
    // sin un despliegue coordinado de los tres servicios el mismo día.
    [Obsolete("Usa ScheduledDate. Se elimina tras migrar frontend y chatbot.")]
    public string? Fecha      { get => ScheduledDate; set { if (value is not null) ScheduledDate = value; } }
    [Obsolete("Usa StartTime.")]
    public string? HoraInicio { get => StartTime;     set { if (value is not null) StartTime = value; } }
    [Obsolete("Usa Address.")]
    public string? Direccion  { get => Address;       set { if (value is not null) Address = value; } }
    [Obsolete("Usa Notes.")]
    public string? Notas      { get => Notes;         set { Notes = value; } }
}
```

Para los `record` de solo lectura (respuestas), lo más simple es una propiedad calculada:

```csharp
public record SlotDisponibleDto(string Date, string StartTime, string EndTime, int Available, bool IsAvailable)
{
    [Obsolete] public string Fecha       => Date;
    [Obsolete] public string HoraInicio  => StartTime;
    [Obsolete] public string HoraFin     => EndTime;
    [Obsolete] public int    Disponibles => Available;
    [Obsolete] public bool   Disponible  => IsAvailable;
}
```

> ⚠️ **Verifica que System.Text.Json serializa las propiedades calculadas.** Lo hace por defecto (son propiedades públicas de lectura), pero **escribe un test que compruebe el JSON literal** antes de desplegar:
> ```csharp
> [Fact]
> public void El_json_conserva_los_campos_en_espanol_durante_la_transicion()
> {
>     var json = JsonSerializer.Serialize(new SlotDisponibleDto("2026-09-01","08:00","10:00",3,true));
>     json.Should().Contain("\"Fecha\"").And.Contain("\"Date\"");
> }
> ```

**Test de contrato obligatorio en esta etapa** — congela el JSON que el frontend y el chatbot esperan hoy:

```csharp
[Fact]
public async Task El_contrato_JSON_de_instalaciones_no_perdio_ningun_campo()
{
    var resp = await _client.GetAsync("/api/installations/slots?fecha=2026-09-01");
    var json = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
    var item = json.RootElement.GetProperty("data")[0];

    foreach (var campo in new[] { "Fecha", "HoraInicio", "HoraFin", "Disponibles",   // viejos
                                  "Date", "StartTime", "EndTime", "Available" })     // nuevos
        item.TryGetProperty(campo, out _).Should().BeTrue($"falta {campo}");
}
```

### Etapa 3 — Frontend y chatbot migran (por separado)

**Frontend** (`telecombolivianet-frontend-develop/frontend/src`, 57 archivos):
1. Actualiza primero los tipos en `src/types/` — TypeScript te marca todos los usos.
2. Un módulo por PR: `installationService` → `coverageService` → páginas.
3. `npm run build` + los tests de Vitest en cada PR.

**Chatbot** (26 archivos): mismo procedimiento; ojo con los *tools* del agente, que construyen payloads a mano.

> **Ventaja de la transición:** si el frontend se queda a medias, **no pasa nada** — el backend sigue aceptando ambos nombres.

### Etapa 4 — Eliminar los campos en español de los DTOs

Solo cuando frontend y chatbot estén migrados y desplegados **y hayan corrido una semana en producción sin incidencias**.

```bash
grep -rn "Fecha\|HoraInicio\|Direccion\|Notas" telecombolivianet-frontend-develop/frontend/src --include=*.ts --include=*.tsx | wc -l   # debe ser 0
grep -rn "Fecha\|HoraInicio\|Direccion" telecombolivianet-chatbot-develop/src --include=*.ts | wc -l                                    # debe ser 0
```

### Etapa 5 — Columnas de BD (OPCIONAL — evalúa si compensa)

> **Recomendación: NO hacerlo, o dejarlo para el final del todo.**
>
> Renombrar columnas obliga a cambiar **el notifier Python en lockstep** (7 archivos con SQL directo: `queries.py`, `context_enricher.py`, `message_renderer.py`, `reminder_context.py`, `dead_letter.py`), y durante el despliegue habrá minutos en que el backend nuevo y el notifier viejo convivan. El beneficio es puramente estético: `HasColumnName` ya te da nombres en inglés en todo el código C#.
>
> Si aun así lo haces: migración con `RENAME COLUMN`, desplegar notifier **primero** con soporte para ambos nombres (`COALESCE`), luego backend, luego limpiar.

## Paso 6.5 — Limpiar los comentarios-changelog

✅ **Conservar** — explican *por qué*:
```csharp
// Se ANEXA en vez de sobrescribir: antes la justificación pisaba la nota existente
// (p. ej. "Mes proporcional: 12 de 31 días"), destruyendo el registro del cálculo.
```

❌ **Eliminar** — narran código borrado (`PaymentService.cs:136-141`):
```csharp
// BUG-10 (auditoría 2026-08-06): aquí vivía una segunda AttachReceiptImageAsync…
```

Va a `CHANGELOG.md`. Regla: **si explica el código que tienes delante, se queda; si narra el que borraste, se va.**

## Paso 6.6 — Funciones largas y literales repetidos

```bash
awk '/^\s*(public|private|internal|protected).*\(/ {n=FNR; name=$0}
     /^\s*}\s*$/ {if (n && FNR-n > 50) printf "%s:%d (%d líneas) %s\n", FILENAME, n, FNR-n, name; n=0}' \
  $(find src -name "*.cs" -not -path "*/obj/*" -not -path "*/Migrations/*")
```

Y **usa la constante que ya existe** (**C5**): `AppConstants.Billing.FallbackPlanName` está definida y **nadie la usa**, mientras `PaymentService` tiene 10 literales `"—"` sueltos.

## Criterio de salida

- [ ] Etapas 1–4 completas; Etapa 5 decidida y documentada
- [ ] Test de contrato JSON verde en cada etapa
- [ ] Paridad de esquema verde
- [ ] Cero campos en español en frontend y chatbot
- [ ] Cero funciones > 50 líneas · Comentarios-changelog en `CHANGELOG.md`
- [ ] `ADR-003` explicando la transición de doble campo

---

# FASE 7 — Performance

> **Duración:** 1 semana · **Riesgo:** bajo · **Independiente** (se puede adelantar)

## Paso 7.1 — Medir antes de tocar

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT substring(query,1,90) AS consulta, calls,
       round(mean_exec_time::numeric,1) AS ms_media,
       round(total_exec_time::numeric)  AS ms_total
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
```

Guarda los 10 peores en `docs/PERF_BASELINE.md`.

## Paso 7.2 — Índices trigram (**corregido por C6**)

`ClientProjectionHelpers.ApplyFullTextSearch` filtra por **8 columnas**, y **`PhoneMain`/`PhoneSecondary` NO usan `.ToLower()`**:

```csharp
c.FullName.ToLower().Contains(q)     || c.TbnCode.ToLower().Contains(q)      ||
c.IdentityCard.ToLower().Contains(q) || c.WinboxNumber.ToLower().Contains(q) ||
c.PhoneMain.Contains(q)              ||   // ← sin lower()
c.Zone.ToLower().Contains(q)         ||
(c.PhoneSecondary != null && c.PhoneSecondary.Contains(q)) ||  // ← sin lower()
(c.Email != null && c.Email.ToLower().Contains(q))
```

Un índice `gin (lower(col))` **no se usaría** en los dos teléfonos. Índices que sí corresponden:

```csharp
protected override void Up(MigrationBuilder mb)
{
    mb.Sql("CREATE EXTENSION IF NOT EXISTS pg_trgm;");

    // Columnas comparadas con lower(): índice sobre la MISMA expresión
    foreach (var col in new[] { "FullName", "TbnCode", "IdentityCard", "WinboxNumber", "Zone", "Email" })
        mb.Sql($@"CREATE INDEX IF NOT EXISTS ix_clients_{col.ToLower()}_trgm
                  ON ""Clients"" USING gin (lower(""{col}"") gin_trgm_ops);");

    // Teléfonos: se comparan SIN lower(), así que el índice va sobre la columna cruda
    mb.Sql(@"CREATE INDEX IF NOT EXISTS ix_clients_phonemain_trgm
             ON ""Clients"" USING gin (""PhoneMain"" gin_trgm_ops);");
    mb.Sql(@"CREATE INDEX IF NOT EXISTS ix_clients_phonesecondary_trgm
             ON ""Clients"" USING gin (""PhoneSecondary"" gin_trgm_ops);");
}
```

> ⚠️ **Gotcha del proyecto:** las migraciones con extensiones ya rompieron despliegues (PostGIS). Verifica que el PostgreSQL de Railway permite `CREATE EXTENSION pg_trgm`; si no, aplícalo por consola y registra la migración en `__EFMigrationsHistory` a mano — el mismo procedimiento que usaste con PostGIS.

**El código C# no cambia.** Verificación:

```sql
EXPLAIN ANALYZE SELECT * FROM "Clients" WHERE lower("FullName") LIKE '%juan%';
-- Antes: Seq Scan · Después: Bitmap Index Scan on ix_clients_fullname_trgm
```

## Paso 7.3 — `AsSplitQuery` donde procede

`PaymentService.GetAllAsync` hace 3 `Include` de colección → producto cartesiano.

```bash
grep -rn "ThenInclude" src --include=*.cs | grep -v obj | cut -d: -f1 | sort | uniq -c | sort -rn
```

> **No lo apliques a ciegas:** con **un solo** `Include` de colección, `AsSplitQuery` es **más lento** (2 viajes). Mide cada caso.

## Paso 7.4 — Paginación donde falta

75 `ToListAsync()` vs 11 `Skip()`. Los tres que crecen sin techo:

| Método | Problema | Solución |
|---|---|---|
| `GetBillingPreviewAsync` | Carga todos los clientes facturables para contar | Agregar en SQL |
| `MarkOverdueInvoicesAsync` | Carga todas las vencidas | Lotes de 500 |
| `SendOverdueRemindersAsync` | Carga todos los morosos con facturas | Lotes |

```csharp
var stats = await _clientRepo.GetAllReadOnly()
    .Where(c => billable.Contains(c.Status) && c.InstallationDate < monthEnd
             && !existingClientIds.Contains(c.Id))
    .GroupBy(_ => 1)
    .Select(g => new {
        ToGenerate = g.Count(c => c.Plan != null),
        WithErrors = g.Count(c => c.Plan == null),
        Total      = g.Where(c => c.Plan != null).Sum(c => c.Plan!.MonthlyPrice) })
    .FirstOrDefaultAsync();
```

La caracterización de F0 ya cubre este método: los números deben salir idénticos.

## Paso 7.5 — El `NOT IN` creciente de `AutoSuspendClientJob`

`AutoSuspendClientJob.cs:108-119` acumula `skippedIds` en el `WHERE`. Sustituir por paginación por keyset (`c.Id > lastId`), que no necesita lista de exclusión.

## Criterio de salida

- [ ] `PERF_BASELINE.md` con antes/después · Índices verificados con `EXPLAIN ANALYZE`
- [ ] `AsSplitQuery` **medido** donde se aplica · `GetBillingPreviewAsync` sin cargar a memoria
- [ ] Suite + caracterización con los mismos números

---

# FASE 8 — Endurecer la seguridad

> **Duración:** 3 días · **Riesgo:** bajo · **Independiente**

## Paso 8.1 — Rol propio para el bot

`Program.cs:254` crea el usuario del chatbot con `UserRole.Tecnico`: el bot puede todo lo que un técnico humano.

```csharp
public enum UserRole { Admin, Operador, Tecnico, SocioLectura, Bot }

.AddPolicy("BotOrAdmin", p => p.RequireRole("Bot", "Admin"))
.AddPolicy("AllRoles",   p => p.RequireRole("Admin","Operador","Tecnico","SocioLectura","Bot"))
```

Endpoints hoy con `"AllRoles"` solo para que llegue el bot: `by-phone`, `by-phone-all`, `invoices/bot`, `search`.

⚠️ **Rompe el chatbot si te equivocas.** Secuencia: crear rol y políticas (aditivo) → cambiar el usuario bot en BD → **verificar E2E por WhatsApp con un número de prueba** → solo entonces restringir. Revertir es un `UPDATE` de una fila.

## Paso 8.2 — Resiliencia HTTP

**Cero Polly en todo el backend.** Cuatro integraciones sin reintentos: `WhatsAppNotifier`, `ChatbotDirectNotifier`, `NominatimGeocoder`, `ResendEmailService`/`SmtpEmailService`.

```xml
<PackageReference Include="Microsoft.Extensions.Http.Resilience" Version="8.*" />
```

```csharp
services.AddHttpClient<IWhatsAppNotifier, WhatsAppNotifier>()
    .AddStandardResilienceHandler(o =>
    {
        o.Retry.MaxRetryAttempts = 3;
        o.Retry.BackoffType      = DelayBackoffType.Exponential;
        o.Retry.UseJitter        = true;
        o.AttemptTimeout.Timeout = TimeSpan.FromSeconds(10);
    });
```

> **No lo apliques a `ChatbotMonitor`**: `ChatbotDirectNotifier` ya tiene un fallback deliberado (si falla, cae al notifier con plantilla). Reintentos donde **no** hay fallback; fallback donde lo hay.

## Paso 8.3 — Migración automática al arranque, con traza

```csharp
if (!app.Configuration.GetValue<bool>("SkipStartupMigration"))
{
    var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
    if (pending.Count > 0)
        Log.Warning("Migraciones PENDIENTES ({Count}): {Migraciones}", pending.Count, string.Join(", ", pending));
    await db.Database.MigrateAsync();
}
```

Como mínimo queda registrado qué esquema cambió en cada deploy.

## Paso 8.4 — Verificaciones menores

- **`RESET_ADMIN`** en Railway: debe estar en `false` o ausente.
- **CSP `style-src 'unsafe-inline'`** (`Program.cs:301`): prueba a quitarlo; si el panel se rompe, revierte y documenta por qué hace falta.
- **`ForwardedHeaders`** con `KnownProxies.Clear()`: verifica en Railway que solo el proxy alcanza el servicio y **anótalo como supuesto de seguridad en el README**. Un supuesto no documentado es un agujero esperando.

## Criterio de salida

- [ ] Rol `Bot` + chatbot verificado E2E + endpoints restringidos
- [ ] Resiliencia en las 3 integraciones sin fallback, con test de reintento
- [ ] Log de migraciones pendientes · `RESET_ADMIN` verificado · Supuesto documentado

---

# FASE 9 — Convención única y documentación

> **Duración:** 3 días · **Riesgo:** nulo

## `CONVENCIONES.md`

```markdown
# Convenciones — Backend TelecomBoliviaNet

| Necesito… | Va en… |
|---|---|
| Caso de uso que MODIFICA estado | `Application/<Modulo>/Commands/XxxCommand.cs` (MediatR) |
| Caso de uso de solo LECTURA | `Application/<Modulo>/Queries/XxxQuery.cs` (MediatR) |
| Regla de negocio pura (sin BD) | `Domain/Services/` — estático, testeable sin mocks |
| Consulta con Include/JOIN | Método con nombre de negocio en `I<Agregado>Repository` |
| Mapeo entidad → DTO | `Application/<Modulo>/<Modulo>Mapper.cs`, estático |
| Integración externa | `Infrastructure/Services/` tras interfaz en `Application/Interfaces/` |
| Tarea periódica | `Infrastructure/Jobs/`, SIEMPRE con `JobLease.TryRunExclusiveAsync` |

**`Application/Services/` está CONGELADO.** No se añaden clases ahí.

## Reglas duras
1. Ninguna clase de Application supera 250 líneas.
2. Ningún constructor supera 6 dependencias.
3. Ninguna función supera 50 líneas.
4. **Todo en inglés**: entidades, DTOs, API. (Las columnas de BD siguen en español
   con `HasColumnName` — ver ADR-003.)
5. Todo handler con >1 escritura usa `IUnitOfWork` o lleva comentario justificando.
6. Un comentario explica POR QUÉ. El historial va a git.
7. **Nunca `dotnet ef migrations add/remove --no-build`** (borra la migración equivocada).
8. Las migraciones se escriben A MANO. El guardia es el test de paridad de esquema.
```

## ADRs en `docs/adr/`

- `ADR-001-ef-core-en-application.md` — Nivel A y no B
- `ADR-002-advisory-locks-para-jobs.md` — por qué no Hangfire/Quartz
- `ADR-003-migracion-a-ingles.md` — transición de doble campo; por qué las columnas se quedan
- `ADR-004-migraciones-escritas-a-mano.md` — el drift, el test de paridad, el gotcha del `--no-build`

## Puertas de calidad en el CI

```yaml
      - name: Paridad de esquema
        run: dotnet test tests/TelecomBoliviaNet.IntegrationTests --filter "FullyQualifiedName~SchemaParity"

      - name: No crecer en dependencia de EF Core
        run: |
          N=$(grep -rl "using Microsoft.EntityFrameworkCore" src/TelecomBoliviaNet.Application --include=*.cs | wc -l)
          echo "Application con EF Core: $N"
          if [ "$N" -gt 30 ]; then echo "::error::Regresión de DIP (techo: 30)"; exit 1; fi

      - name: Sin campos en español en el contrato
        run: |
          N=$(grep -rn "public.*\(Fecha\|HoraInicio\|Direccion\|Notas\|Motivo\)" \
              src/TelecomBoliviaNet.Application/DTOs --include=*.cs | wc -l)
          if [ "$N" -gt 0 ]; then echo "::error::Quedan $N campos en español en DTOs"; exit 1; fi
```

Un umbral en el CI es lo que impide que la mejora se deshaga sola en tres meses.

---

# Apéndice A — Protocolo de despliegue

```bash
git checkout -b fase-2-jobs-coordinados          # commits pequeños, uno por paso

dotnet build Project-Telecom-Bolivianet.sln -c Release
dotnet test  Project-Telecom-Bolivianet.sln -c Release      # vs baseline.txt: 0 regresiones

docker compose build backend && docker compose up -d backend
docker restart bolivianet-frontend               # Nginx cachea la IP del backend
curl -s localhost:5000/health
# Navegar 5 pantallas + una conversación de prueba con el chatbot

npx @railway/cli up --service backend
curl -s https://<backend>/health                 # y revisar logs 10 minutos
```

**Ventana:** evita los días 1–5 de cada mes (facturación y vencimientos) y las 13:30 UTC (`AutoSuspendClientJob`).

**Rollback:** redesplegar el commit anterior. **Ninguna fase crea migraciones destructivas**: la única que toca el esquema es F7 (índices), cuyo `Down()` solo hace `DROP INDEX`.

## ⚠️ Antes de cualquier comando `dotnet ef`

```bash
cp -r src/TelecomBoliviaNet.Infrastructure/Migrations Migrations.BACKUP-$(date +%H%M)
```

Y **nunca uses `--no-build`** (C2). Con `--no-build`, `migrations remove` borra la última migración del **ensamblado compilado**, que no es la que acabas de crear.

---

# Apéndice B — Si te quedas sin tiempo

| Tienes… | Haz | Ganancia |
|---|---|---|
| **1 semana** | F0 | Git, CI real, paridad de esquema, caracterización |
| **2 semanas** | + F1 + F2 | Escalabilidad 5 → 8; despliegue sin downtime |
| **1 mes** | + F3 + F7 | Transacciones correctas + búsquedas indexadas |
| **2 meses** | + F4 parcial + F8 | SOLID 5.5 → 7; seguridad 9.5 |
| **4 meses** | Todo, incl. F6 inglés | Las 6 notas en objetivo |

**Si solo pudieras hacer cuatro cosas:**
1. **F0.1** — poner el repo bajo git. Sin esto nada tiene rollback.
2. **F0.4** — el test de paridad de esquema. Sin él, F5 y F6 son a ciegas.
3. **F2** — coordinación de jobs. Único hallazgo que impide operar con más de una instancia.
4. **F3.3** — transacción en `CompleteInstallationCommand`. Único que **hoy** puede dejar datos inconsistentes en producción.

---

# Apéndice C — Archivos que toca cada fase

| Fase | Principales |
|---|---|
| F0 | `.github/workflows/ci.yml`, borrar `DatabaseFixture.cs`, `MigratedDatabaseFixture.cs` + `SchemaParityTests.cs` (nuevos), 5 tests de caracterización |
| F1 | `DependencyInjection.cs`, `PaymentService.cs`, `BillingService.cs`, `AppConstants.cs`, ~10 interfaces nuevas |
| F2 | `JobLease.cs` (nuevo) + los 11 `*Job.cs` |
| F3 | `IGenericRepository.cs`, `GenericRepository.cs`, `CompleteInstallationCommand.cs`, ~40 llamadores |
| F4 | 5 repositorios nuevos, ~47 archivos de Application |
| F5 | Los 6 fat services + `AppDbContext` + ~50 archivos en `Data/Config/` |
| F6 | 12 entidades, 12 archivos de DTO, **57 archivos de frontend**, **26 de chatbot**, (opcional) 7 del notifier |
| F7 | Migración `AddTrigramSearchIndexes`, `PaymentService`, `BillingService`, `AutoSuspendClientJob` |
| F8 | `UserRole.cs`, `JwtConfiguration.cs`, `DependencyInjection.cs`, `Program.cs`, 4 controladores |
| F9 | `CONVENCIONES.md`, `docs/adr/*`, `ci.yml` |
