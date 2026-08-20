# TelecomBoliviaNet — Backend (.NET 8)

API REST del núcleo de negocio: autenticación JWT con roles (Admin/Técnico/Cajero),
clientes con código TBN correlativo, planes y cambios de plan con prorrateo,
facturación automática mensual, pagos y cierre de caja, tickets con SLA y balanceo
de técnicos, instalaciones con agenda/slots, cobertura georreferenciada (PostGIS),
notificaciones configurables (outbox) y alertas en tiempo real (SignalR).

## Arquitectura (Clean Architecture)

```
src/
├── TelecomBoliviaNet.Domain/          # Entidades, enums, reglas de dominio (sin dependencias)
├── TelecomBoliviaNet.Application/     # Casos de uso (commands/queries MediatR), DTOs, validadores, interfaces
├── TelecomBoliviaNet.Infrastructure/  # EF Core, repositorios, migraciones, jobs en background, servicios externos
└── TelecomBoliviaNet.Presentation/    # Controllers, middleware, SignalR hubs, DI, Program.cs
tests/
├── TelecomBoliviaNet.UnitTests/          # Tests de dominio puros
├── TelecomBoliviaNet.Tests/              # Tests de handlers/servicios (con mocks)
└── TelecomBoliviaNet.IntegrationTests/   # Tests con PostgreSQL real (Testcontainers, requiere Docker)
```

## Requisitos

- .NET SDK 8.0
- PostgreSQL 16 **con PostGIS** (el módulo de cobertura usa columnas `geometry`)
- Docker (para los tests de integración y/o para la BD)

## Configuración

Variables (formato `Seccion__Clave` como variables de entorno, o `appsettings.json`):

| Variable | Descripción |
|---|---|
| `ConnectionStrings__DefaultConnection` | `Host=...;Port=5432;Database=telecombolivianet;Username=...;Password=...` |
| `Jwt__Key` | Clave HS256, mínimo 32 caracteres |
| `Jwt__Issuer` / `Jwt__Audience` | `TelecomBoliviaNet` / `TelecomBoliviaNet_Client` |
| `SecretEncryption__Key` | Clave AES-256 para secretos en BD (distinta a Jwt__Key) |
| `Chatbot__BaseUrl` | URL interna del chatbot (ej. `http://localhost:3001`) |
| `Chatbot__InternalToken` | Token estático compartido con el chatbot |
| `WhatsApp__Token` / `WhatsApp__PhoneNumberId` | Credenciales Meta (opcional en desarrollo) |
| `Email__Provider` | `Smtp` (Gmail) o `Resend` |

Ver `.env.example` en la raíz del monorepo para la lista completa.

## Ejecutar en desarrollo

```bash
# 1. Base de datos (desde la raíz del monorepo)
docker compose up -d postgres

# 2. API (desde esta carpeta)
dotnet run --project src/TelecomBoliviaNet.Presentation
```

- Al arrancar aplica migraciones EF automáticamente y siembra datos iniciales
  (usuario admin, planes, secuencia TBN) si la BD está vacía.
- Swagger: http://localhost:5000/swagger
- Health: http://localhost:5000/health
- Para saltar la migración automática: variable `SkipStartupMigration=true`.

## Tests

```bash
dotnet test                                                    # todos (sln en la raíz)
dotnet test tests/TelecomBoliviaNet.UnitTests                  # dominio
dotnet test tests/TelecomBoliviaNet.Tests                      # handlers/servicios
dotnet test tests/TelecomBoliviaNet.IntegrationTests           # requiere Docker corriendo
```

## Docker

```bash
docker build -t tbn-backend .
docker run -p 5000:5000 --env-file ../.env tbn-backend
```

## Jobs en segundo plano

`BillingBackgroundJob` (facturación mensual), `AutoSuspendClientJob` (cortes por mora),
`SlaAlertJob` (alertas de SLA), `AutoCloseTicketJob` (auto-cierre a los 3 días),
`SendInstallationRemindersJob` (confirmación de instalación T-1 por WhatsApp con
botones vía chatbot), `QrExpiryAlertJob` / `CompanyQrExpiryAlertJob`.

## Endpoints principales

`/api/auth`, `/api/clients`, `/api/plans`, `/api/invoices`, `/api/payments`,
`/api/tickets`, `/api/instalaciones`, `/api/coverage`, `/api/notifications`,
`/api/dashboard`, `/api/users`, `/api/audit-logs`, `/hubs/admin` (SignalR).
