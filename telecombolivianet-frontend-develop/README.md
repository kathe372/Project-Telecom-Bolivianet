# TelecomBoliviaNet — Frontend (React + Vite)

Panel administrativo (SPA): dashboard con KPIs, clientes, planes y cambios de plan,
cobranza y pagos con cierre de caja, tickets, instalaciones (lista + calendario +
agenda del técnico), mapa de cobertura con zonas/cajas NAP/casas de clientes
(Leaflet + Geoman), consola de conversaciones del chatbot con takeover humano,
configuración del bot, notificaciones, usuarios y auditoría.

## Stack

React 18 + TypeScript + Vite · TailwindCSS · Zustand (estado) ·
react-hook-form + Zod (formularios) · react-leaflet + Geoman (mapas) ·
@microsoft/signalr (alertas en vivo) · Vitest + Testing Library (tests)

```
frontend/src/
├── pages/          # Una página por módulo (ClientsPage, CoverageMapPage, ...)
├── components/     # Por dominio: coverage/, dashboard/, clients/, layout/, ...
├── services/       # Clientes HTTP por módulo (axios, interceptor JWT + refresh)
├── store/          # authStore (sesión)
├── hooks/          # useAdminHub (SignalR), usePageTitle, ...
└── types/          # DTOs TypeScript
```

## Requisitos

- Node.js 20+
- Backend corriendo en `http://localhost:5000` (el dev-server proxyea `/api` y `/hubs`)

## Ejecutar en desarrollo

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

El proxy de desarrollo (vite.config.ts) redirige `/api` y `/hubs` (WebSocket)
al backend en :5000 — no se necesita configurar URLs.

Usuario inicial: `admin@telecombolivianet.bo` (seed del backend).

## Tests y build

```bash
npm test             # ~142 tests (Vitest)
npm run lint
npm run build        # tsc (typecheck) + vite build → dist/
```

## Docker / producción

El `Dockerfile` (en esta carpeta, contexto = esta carpeta) compila la SPA y la
sirve con **nginx**, que además hace de reverse proxy:

- `/api/*` y `/uploads/*` → backend (`BACKEND_INTERNAL_URL`)
- `/hubs/*` → backend con upgrade WebSocket (SignalR)
- `/chatbot-uploads/*` → chatbot (`CHATBOT_INTERNAL_URL`)
- `index.html` se sirve con `no-cache` (los assets con hash cachean 1 año)

Variables del contenedor:

| Variable | Default | Uso |
|---|---|---|
| `BACKEND_INTERNAL_URL` | `http://backend:5000` | destino del proxy |
| `CHATBOT_INTERNAL_URL` | `http://chatbot:3001` | multimedia del bot |
| `NGINX_RESOLVER` | `[fd12::10]` (DNS de Railway) | en Docker local usar `127.0.0.11` |

```bash
docker build -t tbn-frontend .
docker run -p 80:80 -e BACKEND_INTERNAL_URL=http://backend:5000 -e NGINX_RESOLVER=127.0.0.11 tbn-frontend
```
