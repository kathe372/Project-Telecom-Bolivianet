import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import asyncio
import pytest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("DB_POOL_MAX_SIZE", "10")

from app.jobs.outbox_worker import MAX_CONCURRENT, _process_batch
from app.domain.records import RawOutboxRow
from helpers import make_pool_from_conns, make_record


@pytest.mark.asyncio
async def test_semaphore_limits_concurrency():
    """No more than MAX_CONCURRENT coroutines should run simultaneously."""
    concurrent_count = 0
    max_seen = 0

    async def slow_task(pool, channel, row, sys_config, on_sent=None, on_failed=None):
        nonlocal concurrent_count, max_seen
        concurrent_count += 1
        max_seen = max(max_seen, concurrent_count)
        await asyncio.sleep(0.02)
        concurrent_count -= 1

    rows_count = MAX_CONCURRENT * 4  # enough to stress the semaphore
    # fetch_and_claim_batch devuelve RawOutboxRow (acceso por atributo), no dicts.
    fake_rows = [RawOutboxRow.from_db_row(make_record()) for _ in range(rows_count)]

    pool = AsyncMock()
    channel = AsyncMock()

    # Patch fetch_and_claim_batch to return our fake rows
    with (
        patch("app.jobs.outbox_worker.fetch_and_claim_batch", new=AsyncMock(return_value=fake_rows)),
        patch("app.jobs.outbox_worker.fetch_sys_config", new=AsyncMock(return_value={})),
        patch("app.jobs.outbox_worker.process_record", new=slow_task),
    ):
        await _process_batch(pool, channel, batch_size=rows_count,
                             on_sent=None, on_failed=None)

    assert max_seen <= MAX_CONCURRENT, (
        f"Max concurrent tasks ({max_seen}) exceeded semaphore limit ({MAX_CONCURRENT})"
    )
