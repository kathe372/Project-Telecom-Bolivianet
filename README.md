# TelecomBoliviaNet — Sistema de Gestión para ISP con Chatbot IA

Sistema integral para un proveedor de internet (ISP): gestión de clientes, facturación,
pagos, tickets de soporte, instalaciones, cobertura georreferenciada y atención
automatizada por WhatsApp con inteligencia artificial.

## Arquitectura (4 servicios)

| Servicio | Carpeta | Tecnología | Puerto |
|---|---|---|---|
| **Backend** (núcleo de negocio) | `telecombolivianet-backend-develop` | C# .NET 8, EF Core, PostgreSQL + PostGIS | 5000 |
| **Chatbot WhatsApp** | `telecombolivianet-chatbot-develop` | NestJS (Node 20), Gemini AI, pgvector, Redis | 3001 |
| **Notifier** (worker de notificaciones) | `telecombolivianet-notifier-develop` | Python 3.12, asyncpg | — |
| **Frontend** (panel administrativo) | `telecombolivianet-frontend-develop` | React 18 + Vite + TypeScript, nginx | 80 |

Infraestructura: PostgreSQL 16 + PostGIS (backend/notifier), PostgreSQL 16 + pgvector
(chatbot RAG), Redis 7 (sesiones del bot).

Cada carpeta tiene su propio `README.md` con instrucciones detalladas.

## Requisitos

- **Docker Desktop** (forma recomendada de ejecutar todo)
- Para desarrollo por servicio: .NET SDK 8, Node.js 20+, Python 3.12+

## Ejecución rápida (todo el sistema con Docker)

1. Copiar la plantilla de variables de entorno y completarla:

   ```bash
   copy .env.example .env      # Windows
   # cp .env.example .env      # Linux/Mac
   ```

   Variables mínimas obligatorias (el resto tiene valores por defecto):
   `DB_PASSWORD`, `CHATBOT_DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_KEY`,
   `SECRET_ENCRYPTION_KEY`, `SISTEMA_BOT_STATIC_TOKEN`, `SISTEMA_BOT_PASSWORD`,
   `META_VERIFY_TOKEN`. Para probar sin credenciales de Meta: `WHATSAPP_MOCK=true`.

2. Levantar todo:

   ```bash
   docker compose up -d --build
   ```

3. Verificar:
   - Panel web: http://localhost (usuario inicial `admin@telecombolivianet.bo`,
     la contraseña se define en el seed inicial; ver README del backend)
   - Salud backend: `docker exec bolivianet-backend curl -s http://localhost:5000/health`
   - Salud chatbot: http://localhost:3001/health

4. Detener: `docker compose down` (los datos persisten en volúmenes Docker).

## Ejecución en desarrollo (servicio por servicio)

Levantar solo la infraestructura con Docker y cada servicio en su terminal:

```bash
docker compose up -d postgres postgres-chatbot redis
```

Luego seguir el README de cada carpeta. Orden recomendado:
backend → chatbot → notifier → frontend.

## Tests

| Servicio | Comando | Suites |
|---|---|---|
| Backend | `dotnet test` (desde la raíz, usa `Project-Telecom-Bolivianet.sln`) | ~443 tests |
| Chatbot | `npx jest --ci` (en su carpeta) | ~595 tests |
| Notifier | `python -m pytest tests` (en su carpeta) | ~220 tests |
| Frontend | `npm test` (en `frontend/`) | ~142 tests |
| E2E | `npx playwright test` (raíz; requiere el stack Docker arriba) | mapa de cobertura |

## Estructura del repositorio

```
├── docker-compose.yml            # Orquesta los 7 contenedores
├── .env.example                  # Plantilla de variables de entorno
├── Project-Telecom-Bolivianet.sln
├── e2e/                          # Tests end-to-end (Playwright)
├── telecombolivianet-backend-develop/
├── telecombolivianet-chatbot-develop/
├── telecombolivianet-frontend-develop/
└── telecombolivianet-notifier-develop/
```

## Despliegue en producción

El sistema está desplegado en Railway (un servicio por carpeta, cada una con su
`Dockerfile` y `railway.toml`). Se despliega con:

```bash
npx @railway/cli up --service <telecom-backend|telecom-chatbot|telecom-frontend|telecom-notifier>
```

## Supuestos de seguridad

Estas son cosas que el código da por ciertas y que **no puede comprobar por sí
mismo**. Si alguna deja de cumplirse, deja de haber una protección sin que nada
falle ni avise.

### El backend no se alcanza sin pasar por el proxy

`Program.cs` configura `ForwardedHeaders` con `KnownNetworks.Clear()` y
`KnownProxies.Clear()`: acepta la IP que venga en `X-Forwarded-For` **sin
verificar quién la puso**. Es necesario porque el proxy de Railway no tiene una
IP fija que se pueda declarar.

La consecuencia es que cualquiera que llegue **directamente** al servicio puede
decir que es la IP que quiera. Con eso se falsea la IP de los registros de
auditoría y se esquiva cualquier límite por IP —incluido el bloqueo por intentos
de acceso fallidos—.

El supuesto que lo sostiene: **el contenedor del backend solo es accesible a
través del proxy de Railway**, nunca por su dirección interna desde fuera. Al
cambiar de proveedor o abrir un puerto, esto hay que rehacerlo: declarar el
proxy en `KnownProxies` o volver a no confiar en la cabecera.

### `style-src 'unsafe-inline'` en la política de contenido

La CSP permite estilos en línea. No es un descuido: quitarlo rompe el panel, que
los usa. Rebaja la protección contra inyección de estilos (exfiltración por CSS,
suplantación visual), no contra ejecución de scripts — `script-src` sigue siendo
`'self'`.

### Credenciales

`appsettings.Production.json` no lleva ninguna: cadena de conexión, clave JWT y
tokens de WhatsApp se inyectan por variables de entorno. Los valores por defecto
que aparecen en `docker-compose.yml` (`${DB_PASSWORD:-...}`) son para levantar el
sistema en local; **un despliegue que no defina `DB_PASSWORD` se queda con una
contraseña que está publicada en este repositorio**.
