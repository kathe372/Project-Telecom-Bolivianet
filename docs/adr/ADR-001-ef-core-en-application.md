# ADR-001 — EF Core fuera de la capa Application (nivel pragmático)

**Estado:** aceptado · **Fecha:** 2026-08-25 · **Fase del plan:** F4

## Contexto

`IGenericRepository<T>` exponía `GetAll()`, que devuelve `IQueryable<T>`. Componer
esa consulta obliga a importar `Microsoft.EntityFrameworkCore` para `Include`,
`ThenInclude`, `FirstOrDefaultAsync`, `IgnoreQueryFilters` y compañía. El
resultado: **77 de 204 archivos** de `TelecomBoliviaNet.Application` dependían del
ORM, es decir, la capa de casos de uso conocía la tecnología de persistencia.

Tres consecuencias concretas, no teóricas:

1. **Los tests necesitaban `MockQueryable`** para que `FirstOrDefaultAsync`
   funcionara sobre una lista en memoria. Cada test arrastraba ese andamiaje.
2. **Las reglas de negocio se escribían dos veces.** La definición de "cliente con
   deuda" vivía como predicado LINQ en cada pantalla que lo necesitaba; cuando una
   se corrigió y la otra no, la grilla mostraba "Bs. 149" y el filtro "Con deuda"
   escondía a ese mismo cliente.
3. **Un cambio de ORM tocaría 77 archivos de lógica de negocio**, que es
   exactamente lo que la arquitectura por capas dice evitar.

## Decisión

Se adopta el **nivel A (pragmático)**: bajar a **≤30 archivos** de Application con
EF Core, mediante repositorios específicos por agregado que exponen consultas con
nombre de negocio.

Se descartó el nivel B (cero EF en Application, 8-10 semanas). Un refactor que se
queda a medias deja tres arquitecturas conviviendo en vez de dos, y este es un
proyecto de un solo desarrollador con fecha de entrega.

### Forma que toman los repositorios

```csharp
public interface IClientRepository : IGenericRepository<Client>
{
    Task<Client?> GetWithPlanAsync(Guid id, CancellationToken ct = default);
    Task<(List<Client> Items, int Total)> GetPagedAsync(
        ClientListFilter filter, CancellationToken ct = default);
}
```

El filtro viaja como `record` de Domain (`ClientListFilter`, `TicketListFilter`,
`InstallationListFilter`), no como `IQueryable` a medio componer. Las
proyecciones que no son la entidad completa también viven en Domain
(`ClientMapPoint`, `SlaTrackedTicket`, `TechnicianLoad`, `InvoicePlanSnapshot`):
son la forma del dato que el repositorio devuelve, no DTOs de la API.

**Crecen por demanda.** Cada método se añade cuando un caso de uso real lo
necesita. Una interfaz de repositorio con treinta métodos que nadie usa es el
mismo problema con otro nombre.

### Registro en el contenedor

El registro abierto se mantiene, y los específicos van **después** para ganarle:

```csharp
services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));
services.AddScoped<IClientRepository, ClientRepository>();
```

## Resultado

**77 → 29 archivos** de Application con EF Core (meta: ≤30).

Repositorios específicos creados: `IClientRepository`, `IInstallationRepository`,
`IDistributionBoxRepository`, `IUserRepository`, `ITicketRepository`,
`IAuditLogRepository`, `ITicketVisitRepository`, `IScheduleRepository`,
`IInvoiceRepository`, `IPaymentRepository`, `IClientAttachmentRepository`,
`IClientQrRepository`, `INotifLogRepository`, `IPlanChangeRequestRepository`,
`ISlaPlanRepository`, `ITicketCommentRepository`, `ITicketWorkLogRepository`,
`ITicketAttachmentRepository`.

### El beneficio que se buscaba

```csharp
// Antes
var repo = new Mock<IGenericRepository<Client>>();
repo.Setup(r => r.GetAll()).Returns(new[] { cliente }.AsQueryable().BuildMock());

// Ahora
var repo = SpecificRepoMock.Clients(cliente);
```

`SpecificRepoMock` reproduce en memoria el filtrado que ahora hace el repositorio,
para que los tests de esos handlers sigan probando algo y no solo el mock.

### Un efecto secundario que importa más de lo que parece

Al mudar las consultas al repositorio, los predicados repetidos se volvieron
constantes con nombre: `InvoiceDomainService.UnpaidStatuses`, los tres estados en
que un ticket ya no consume SLA, los estados en que sigue ocupando a un técnico.
Antes estaban escritos como literales en cuatro y cinco sitios distintos. Esa
duplicación fue la causa directa de dos bugs en producción.

## Lo que se queda con EF Core, y por qué

### 1. Informes con agregación en SQL

`GetTicketKpiQuery`, `InvoiceQueryService`, `PaymentQueryService`,
`CashCloseService`. Son consultas con filtros dinámicos y agregaciones que la base
de datos resuelve mucho mejor que la memoria. Envolverlas en métodos de
repositorio produciría una interfaz con un método por combinación de filtros —el
problema que este ADR evita, con otro disfraz.

### 2. Captura de `DbUpdateConcurrencyException`

`UpdateClientCommand`, `PlanChangeService`, `PaymentService`, `BillingService`,
`InvoiceOperationsService`. Estos archivos importan EF Core **solo** por el tipo
de la excepción que lanza el control de concurrencia optimista (`xmin`); algunos
ya no tienen ninguna consulta.

Cuando los cinco estén migrados en lo demás, compensará una excepción propia del
dominio traducida en el repositorio. Hoy la abstracción costaría más de lo que
quita, y así está anotado en cada uno de esos archivos.

### 3. Servicios de configuración e infraestructura

`AdminSettingsService`, `BotConfigService`, `CompanyProfileService`,
`RefreshTokenService`, el módulo de Notificaciones. Son lectura/escritura de
tablas de configuración y de la bandeja de salida, no reglas de negocio. Entran en
F5, cuando esos servicios se partan por responsabilidad.

## Consecuencias

**A favor**

- Los casos de uso se leen en lenguaje de negocio: `GetWithInvoicesAsync(id)` en
  vez de cuatro líneas de `Include`/`Where`/`FirstOrDefaultAsync`.
- Los tests unitarios pierden el andamiaje de `MockQueryable`.
- Las consultas quedan en un sitio: si una necesita un índice, se sabe dónde mirar.

**En contra**

- Más interfaces que mantener (18 repositorios específicos).
- Un mock que reproduce el filtrado del repositorio puede desincronizarse de él.
  Es un riesgo real: por eso las traducciones a SQL que no son obvias
  —`Contains` sobre una colección en memoria, `IgnoreQueryFilters`, agrupaciones,
  filtros contra enums persistidos como texto— se cubren con **tests de
  integración contra PostgreSQL real**, no con mocks.

## Cómo verificar que sigue cumpliéndose

```bash
cd telecombolivianet-backend-develop/src/TelecomBoliviaNet.Application
grep -rl "Microsoft.EntityFrameworkCore" --include=*.cs . | wc -l   # debe ser ≤30
```

## Relacionado

- `ADR-002` — advisory locks para jobs
- `ADR-004` — migraciones escritas a mano
- `PLAN_MEJORA_TECNICA_2026-08.md`, fase F4
