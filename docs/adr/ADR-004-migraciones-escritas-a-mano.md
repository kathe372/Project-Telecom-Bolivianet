# ADR-004 — Migraciones escritas a mano y guardia de paridad de esquema

**Fecha:** 2026-08-20
**Estado:** Aceptado
**Contexto:** Fase 0 del `PLAN_MEJORA_TECNICA_2026-08.md`

---

## Contexto

Las migraciones de este proyecto **no se generan con `dotnet ef migrations add`**. Se
escriben a mano. Eso no fue una decisión de diseño: fue la reacción a un problema real
que este ADR documenta y acota.

### El problema

EF Core descubre las migraciones de un ensamblado buscando clases que hereden de
`Migration` **y lleven el atributo `[DbContext(typeof(TContext))]`**. Sin ese atributo,
la migración **se ignora en silencio**: no aparece en `Get-Migrations`, no se aplica, y
no se emite ningún aviso.

En este repositorio eso pasó con tres migraciones:

| Migración | Qué aportaba |
|---|---|
| `20260512000001_FixPaymentReceiptGeneratedByFK` | FK e índice de `PaymentReceipts.GeneratedByUserId` |
| `20260531000001_AddCoverageModule` | PostGIS, `CoverageZones`, `DistributionBoxes`, columnas GPS |
| `20260602000001_AddInstallationTechniciansV2` | `InstallationTechnicians`, `VisitTechnicians`, `ReminderSentAt` |

Existía un parche —`MigrationsDbContextLink.cs`, que añade `[DbContext]` a 49
migraciones antiguas con clases parciales— pero se quedó desactualizado y no cubría
estas tres.

### Las consecuencias

1. Los cambios se aplicaron **por SQL directo en producción**, sin quedar en
   `__EFMigrationsHistory`.
2. La base real y el repositorio divergieron durante meses.
3. Cuatro tablas (`CoverageQueries`, `GeocodeCaches`, `NapPorts`, `PortReservations`)
   acabaron existiendo **solo** en producción, sin ninguna migración que las creara.
4. `MigrateAsync()` sobre una base limpia fallaba con
   `42703: column "ReminderSentAt" of relation "Installations" does not exist`.
5. Como generar una migración arrastraba toda esa deriva (una migración de 118 KB
   intentando recrear el esquema entero), el equipo pasó a escribirlas a mano — lo cual
   evitaba el síntoma pero perpetuaba la causa.

---

## Decisión

### 1. Las migraciones se siguen escribiendo a mano

Regenerar el historial con scaffolding exigiría reconstruir el snapshot desde cero y
validar 63 migraciones contra una base de producción viva. El coste no compensa.

**Consecuencia:** toda migración nueva **debe** llevar `[Migration("...")]` **y**
`[DbContext(typeof(AppDbContext))]`. Sin los dos, EF la ignora.

### 2. El guardia es un test de paridad, no `dotnet ef`

El protocolo habitual —"genera una migración; si sale vacía, no rompiste nada"— **no
sirve aquí**: `dotnet ef migrations has-pending-model-changes` reporta deriva
permanentemente.

En su lugar, `SchemaParityTests` levanta PostgreSQL, **aplica las migraciones** (no
`EnsureCreated()`) y compara contra `information_schema`:

| Test | Qué garantiza |
|---|---|
| `Las_migraciones_levantan_una_base_desde_cero` | El repositorio puede reconstruir la base |
| `El_modelo_no_espera_ninguna_tabla_que_las_migraciones_no_creen` | No faltan tablas |
| `El_modelo_no_espera_ninguna_columna_que_las_migraciones_no_creen` | **Protege F5 y F6**: detecta mapeos o `HasColumnName` perdidos |
| `No_aparecen_columnas_huerfanas_nuevas` | La deuda solo puede encoger |

`CustomWebApplicationFactory` sigue usando `EnsureCreated()` para las pruebas de
negocio (es más rápido), pero **ya no es el único camino**: si solo existiera ese, la
suite podría estar verde con las migraciones rotas — que es exactamente lo que pasaba.

### 3. Las migraciones recuperadas son idempotentes

Al devolverles la visibilidad, EF las considera pendientes. Se reescribieron con
`IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` /
`ON CONFLICT DO NOTHING`, de forma que:

- En **producción** son un no-op: los objetos ya existen.
- En una **base nueva** construyen el esquema correcto.

Como segunda red, `docs/sql/F0-registrar-migraciones.sql` las marca como aplicadas en
`__EFMigrationsHistory`.

---

## Reglas que se derivan

1. **Toda migración nueva lleva `[Migration]` + `[DbContext(typeof(AppDbContext))]`.**
2. **Todo DDL de migración es idempotente.** Es barato y elimina una clase entera de
   fallos de despliegue.
3. **Nunca `dotnet ef migrations add/remove --no-build`.** Con `--no-build`, EF opera
   sobre el ensamblado ya compilado: `remove` borra la migración equivocada. Ocurrió el
   2026-08-20 y costó reconstruir `AddProspectBackupPhone` a mano.
4. **Antes de cualquier comando `ef`, copia la carpeta `Migrations/`.**
5. **`SchemaParityTests` es obligatorio en CI.** Si falla, el esquema y el modelo han
   divergido: no se despliega.

---

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Regenerar todas las migraciones con scaffolding | Exige validar 63 migraciones contra producción viva. Riesgo altísimo, beneficio estético. |
| Usar `EnsureCreated()` también en producción | Renuncia al versionado del esquema. Inaceptable en un sistema con datos reales. |
| Confiar en `has-pending-model-changes` | Devuelve `true` permanentemente por la deriva histórica: no distingue señal de ruido. |
| Borrar `MigrationsDbContextLink.cs` y poner el atributo en cada archivo | Equivalente y más limpio, pero toca 49 archivos sin ganancia funcional. Candidato para F9. |
