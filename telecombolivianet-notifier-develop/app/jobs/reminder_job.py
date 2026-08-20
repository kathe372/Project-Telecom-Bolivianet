import asyncio
import os
import random
from datetime import date, datetime
from typing import Optional

import structlog

from app.db.connection import get_pool
from app.db import queries as Q
from app.domain.db_types import Pool
from app.jobs._time_window import BOLIVIA_TZ
from app.jobs.reminder_persistence import (
    get_last_run_day,
    persist_job_run,
    process_reminder_type,
)

log = structlog.get_logger(__name__)


def _env_int(name: str, default: int) -> int:
    """Lee un entero de entorno con default seguro (sin números mágicos en el código)."""
    raw = os.getenv(name)
    return int(raw) if raw else default


JOB_MAX_DURATION_SECONDS = _env_int("REMINDER_JOB_MAX_DURATION_SECONDS", 900)

REMINDER_HOUR         = _env_int("REMINDER_HOUR", 8)
REMINDER_MINUTE_START = _env_int("REMINDER_MINUTE_START", 1)
REMINDER_MINUTE_END   = _env_int("REMINDER_MINUTE_END", 10)

SCHEDULER_BASE_SLEEP_SECONDS   = _env_int("REMINDER_SCHEDULER_SLEEP_SECONDS", 60)
SCHEDULER_JITTER_SECONDS       = _env_int("REMINDER_SCHEDULER_JITTER_SECONDS", 10)
SCHEDULER_MIN_SLEEP_SECONDS    = _env_int("REMINDER_SCHEDULER_MIN_SLEEP_SECONDS", 40)


async def run_once(pool: Pool, target_date: Optional[date] = None) -> None:
    """
    Runs all active reminder types for target_date (today if omitted).
    Callable from CLI (US-05) or from the scheduler.

    Reminder types are read dynamically from NotifConfigs — adding R4 or
    renaming types only requires a DB INSERT, no Python changes.
    """
    today_bo = target_date or datetime.now(BOLIVIA_TZ).date()
    log.info("reminder_job.running", date=str(today_bo))

    async with pool.acquire() as conn:
        configs       = await conn.fetch(Q.FETCH_ALL_CONFIGS)
        config_map    = {r["tipo"]: dict(r) for r in configs}
        reminder_rows = await conn.fetch(Q.FETCH_ACTIVE_REMINDER_TYPES)
        reminder_types = [r["tipo"] for r in reminder_rows]
        sys_config_rows = await conn.fetch(Q.FETCH_SYSTEM_CONFIG_BULK)
        sys_config    = {r["key"]: r["value"] for r in sys_config_rows}

    if not reminder_types:
        log.warning("reminder_job.no_active_types")
        return

    for tipo in reminder_types:
        cfg = config_map.get(tipo)
        if not cfg or not cfg["activo"] or not cfg["dias_antes"]:
            log.debug("reminder_job.skip", tipo=tipo, reason="disabled or no dias_antes")
            continue
        await process_reminder_type(pool, tipo, cfg, today_bo, sys_config)


async def _run_job_work(pool: Pool, today: date) -> None:
    """Trabajo real del job: procesa recordatorios y persiste el run del día."""
    await run_once(pool)
    await persist_job_run(pool, today)


async def _try_run_job(pool: Pool, today: date) -> bool:
    """
    BUG-12 FIX: run lock acquisition, job work, and persistence inside a single
    transaction. pg_try_advisory_xact_lock releases automatically at COMMIT/ROLLBACK,
    so there is no window where a crashed worker leaves the lock stuck forever.

    BUG-2 FIX: el antiguo `SET LOCAL statement_timeout` solo afectaba a `conn`, que
    únicamente ejecuta el advisory lock; el trabajo real corre en otras conexiones
    del pool y quedaba sin límite de duración total. Ahora envolvemos el trabajo en
    asyncio.wait_for: si excede JOB_MAX_DURATION_SECONDS se cancela, la transacción
    hace rollback y el xact lock se libera — sin lock zombie.
    """
    async with pool.acquire() as conn:
        async with conn.transaction():
            acquired = await conn.fetchval(Q.ADVISORY_LOCK_REMINDER)
            if not acquired:
                log.debug("reminder_scheduler.lock_busy")
                return False

            try:
                await asyncio.wait_for(
                    _run_job_work(pool, today),
                    timeout=JOB_MAX_DURATION_SECONDS,
                )
            except asyncio.TimeoutError:
                log.error("reminder_job.timeout",
                          max_seconds=JOB_MAX_DURATION_SECONDS)
                raise
            return True


async def _scheduler_sleep(
    shutdown_event: Optional[asyncio.Event], seconds: float
) -> None:
    """Sleeps for `seconds` or until shutdown_event is set."""
    try:
        if shutdown_event:
            await asyncio.wait_for(shutdown_event.wait(), timeout=seconds)
        else:
            await asyncio.sleep(seconds)
    except asyncio.TimeoutError:
        pass


async def run_reminder_scheduler(
    shutdown_event: Optional[asyncio.Event] = None,
) -> None:
    """Daily loop at 08:01 Bolivia with distributed lock, persistence and jitter."""
    pool         = await get_pool()
    last_run_day = await get_last_run_day(pool)
    log.info("reminder_scheduler.started",
             last_run_day=str(last_run_day) if last_run_day else "never")

    while not (shutdown_event and shutdown_event.is_set()):
        try:
            now_bo    = datetime.now(BOLIVIA_TZ)
            today     = now_bo.date()
            in_window = (now_bo.hour == REMINDER_HOUR
                         and REMINDER_MINUTE_START <= now_bo.minute <= REMINDER_MINUTE_END)
            if in_window and last_run_day != today:
                ran = await _try_run_job(pool, today)
                if ran:
                    last_run_day = today
        except Exception as exc:
            log.error("reminder_scheduler.error", error=str(exc))
        sleep_seconds = max(
            SCHEDULER_MIN_SLEEP_SECONDS,
            SCHEDULER_BASE_SLEEP_SECONDS
            + random.uniform(-SCHEDULER_JITTER_SECONDS, SCHEDULER_JITTER_SECONDS),
        )
        await _scheduler_sleep(shutdown_event, sleep_seconds)
