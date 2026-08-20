# TelecomBoliviaNet — Notifier (Python worker)

Worker asíncrono de notificaciones WhatsApp. No expone API pública: lee la tabla
outbox (`NotifOutbox`) de la base de datos del backend y envía los mensajes por
la Meta Cloud API, con reintentos exponenciales, circuit breaker y dead letter.
Además ejecuta el scheduler diario de recordatorios de pago.

## Componentes (`app/`)

| Módulo | Responsabilidad |
|---|---|
| `jobs/outbox_worker.py` | Loop principal: cada 30 s toma lotes de 50 mensajes pendientes y los envía |
| `jobs/reminder_job.py` | Scheduler diario (zona `America/La_Paz`, respeta ventana horaria) de recordatorios de pago |
| `jobs/message_renderer.py` | Renderiza plantillas con variables del cliente |
| `services/whatsapp.py` | Cliente Meta Cloud API (texto y plantillas) |
| `services/circuit_breaker.py` | Pausa los envíos si Meta falla repetidamente |
| `services/dead_letter.py` | Mensajes que agotaron los 4 reintentos (60 s → 5 m → 30 m → 2 h) |
| `services/health.py` | HTTP interno :8080 → `/healthz`, `/metrics` |
| `migrations/*.sql` | Scripts idempotentes que se aplican al arrancar |

## Requisitos

- Python 3.12 (probado también con 3.13)
- Acceso a la **misma** base PostgreSQL del backend
- Credenciales de Meta (sin ellas arranca en modo STUB: loguea sin enviar)

## Configuración (variables de entorno o `.env`)

```
DATABASE_URL=postgresql://usuario:password@host:5432/telecombolivianet   # obligatoria
WHATSAPP_TOKEN= / WHATSAPP_PHONE_NUMBER_ID=      # producción
POLL_INTERVAL_SECONDS=30
BATCH_SIZE=50
MAX_ATTEMPTS=4
BACKOFF_SECONDS=60,300,1800,7200
TIMEZONE=America/La_Paz
LOG_LEVEL=INFO
```

## Ejecutar

```bash
pip install -r requirements.txt
python main.py                          # worker continuo
python main.py --reminder-date 2026-07-15   # modo manual: procesa una fecha y termina
```

## Tests

```bash
python -m pytest tests    # ~220 tests, cobertura mínima 60% (pytest-cov)
```

## Docker

```bash
docker build -t tbn-notifier .
docker run --env-file ../.env tbn-notifier
```

Apagado limpio: maneja SIGTERM/SIGINT (termina el lote en curso antes de salir).
