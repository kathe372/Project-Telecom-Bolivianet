# TelecomBoliviaNet — Chatbot WhatsApp (NestJS + Gemini AI)

Bot conversacional de atención al cliente por WhatsApp (Meta Cloud API):
clasifica intenciones con Gemini 2.5 Flash, responde preguntas con RAG
(pgvector + embeddings), ejecuta acciones reales contra el backend (consultar
deuda, enviar QR de pago, crear/cerrar tickets, agendar instalaciones, verificar
cobertura por GPS) y escala a agente humano cuando corresponde.

## Módulos principales (`src/modules/`)

| Módulo | Responsabilidad |
|---|---|
| `whatsapp` | Webhook de Meta (firma HMAC-SHA256), envío de texto/botones/listas/plantillas |
| `bot` | Pipeline de mensajes (debounce, sesión, identificación, escalamiento), orquestador IA, 16 herramientas de agente, menú interactivo |
| `ai` / `intent` | Cliente Gemini (API key o Vertex AI OAuth2), clasificación de intents |
| `rag` | Base de conocimiento: chunks + embeddings en pgvector, caché semántico en Redis |
| `session` | Sesiones en Redis (TTL 24 h) con locks distribuidos |
| `client` | Consumo del API del backend C# (JWT del usuario bot, renovación automática) |
| `admin` / `monitoring` | Consola de conversaciones, takeover humano, notificaciones internas del backend (guard por token estático) |
| `media` | Descarga y almacenamiento de imágenes/audio/documentos (local o Supabase) |

## Requisitos

- Node.js 20+
- PostgreSQL 16 con **pgvector** (imagen `pgvector/pgvector:pg16`; `database/init.sql` crea el schema)
- Redis 7 (con contraseña)
- Credenciales de Meta WhatsApp Cloud API (opcional: `WHATSAPP_MOCK=true` simula todo por consola)
- API key de Gemini (https://aistudio.google.com/app/apikey) o Service Account de Vertex AI

## Configuración

Copiar `.env.example` a `.env` y completar. Claves principales:

```
DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE   # PostgreSQL pgvector
REDIS_HOST/REDIS_PORT/REDIS_PASSWORD                  # Redis
SISTEMA_API_URL=http://localhost:5000                 # backend C#
SISTEMA_BOT_EMAIL / SISTEMA_BOT_PASSWORD              # usuario bot del backend
SISTEMA_BOT_STATIC_TOKEN                              # token interno backend<->chatbot
META_APP_SECRET / META_VERIFY_TOKEN / META_ACCESS_TOKEN / META_PHONE_NUMBER_ID
GEMINI_API_KEY  (o GOOGLE_SERVICE_ACCOUNT_JSON)
WHATSAPP_MOCK=true                                    # desarrollo sin Meta
```

## Ejecutar en desarrollo

```bash
# 1. Infraestructura (desde la raíz del monorepo)
docker compose up -d postgres-chatbot redis

# 2. Backend C# corriendo en :5000 (ver su README)

# 3. Chatbot
npm install
npm run start:dev        # hot-reload en http://localhost:3001
```

- Health: http://localhost:3001/health (verifica Redis, Postgres y backend)
- Webhook: `POST /webhook` (Meta) — verificación: `GET /webhook?hub.mode=subscribe&hub.verify_token=...`
- Para recibir WhatsApp real en desarrollo se necesita un túnel público (ngrok)
  apuntando a :3001 y registrar esa URL en Meta Developer Console.

## Tests

```bash
npx jest --ci            # ~595 tests, 43 suites
npm run lint
```

## Build / Docker

```bash
npm run build            # nest build → dist/main.js
docker build -t tbn-chatbot --target production .
```

## Notas de seguridad

- Todo webhook entrante se valida con la firma `X-Hub-Signature-256` (HMAC del
  `rawBody` con `META_APP_SECRET`). No usar `app.use(express.json())` manual:
  rompe el rawBody (ver comentario en `src/main.ts`).
- Los endpoints internos (`/bot/*`, `/monitor/*`, `/rag/*`) exigen el token
  estático (`InternalTokenGuard`, comparación en tiempo constante).
- Datos personales se pseudonimizan antes de enviarse a Gemini (PII guard).
