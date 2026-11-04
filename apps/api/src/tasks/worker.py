from typing import Any

from ..db.session import create_all, dispose_engine
from ..search.factory import prepare_search_backend
from .queue import redis_settings


async def startup(ctx: dict[str, Any]) -> None:
    await create_all()
    await prepare_search_backend()


async def shutdown(ctx: dict[str, Any]) -> None:
    await dispose_engine()


def _job_functions() -> list[Any]:
    from ..ingestion import jobs

    return [
        jobs.ingest_source,
        jobs.ingest_document,
        jobs.reindex_project,
        jobs.deliver_webhook,
    ]


class WorkerSettings:
    functions = _job_functions()
    cron_jobs: list[Any] = []
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = redis_settings()
    max_jobs = 4
    job_timeout = 900
