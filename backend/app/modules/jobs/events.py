import asyncio
import json
import uuid
from collections.abc import AsyncIterator

from fastapi import Request
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.models.background_job import BackgroundJob


JOB_EVENTS_CHANNEL = "MiniApp:background-jobs"
_publisher: Redis | None = None


def _publisher_client() -> Redis:
    global _publisher
    if _publisher is None:
        _publisher = Redis.from_url(
            settings.celery_broker_url,
            decode_responses=True,
        )
    return _publisher


async def publish_job_updated(job: BackgroundJob) -> None:
    payload = json.dumps(
        {
            "job_id": str(job.id),
            "batch_id": str(job.batch_id) if job.batch_id else None,
            "organization_id": (
                str(job.organization_id) if job.organization_id else None
            ),
        }
    )
    try:
        await _publisher_client().publish(JOB_EVENTS_CHANNEL, payload)
    except (RedisError, OSError):
        # Event delivery is best-effort. PostgreSQL remains the source of truth,
        # and clients refresh once their SSE connection is restored.
        return


async def stream_job_events(
    request: Request,
    *,
    organization_id: uuid.UUID | None,
) -> AsyncIterator[str]:
    client = Redis.from_url(
        settings.celery_broker_url,
        decode_responses=True,
    )
    pubsub = client.pubsub()
    try:
        await pubsub.subscribe(JOB_EVENTS_CHANNEL)
        yield "retry: 5000\n\n"

        while not await request.is_disconnected():
            message = await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=15,
            )
            if message is None:
                yield ": keep-alive\n\n"
                continue

            try:
                payload = json.loads(message["data"])
            except (KeyError, TypeError, json.JSONDecodeError):
                continue

            if (
                organization_id is not None
                and payload.get("organization_id") != str(organization_id)
            ):
                continue

            yield f"event: job.updated\ndata: {json.dumps(payload)}\n\n"
    except (RedisError, OSError, asyncio.CancelledError):
        return
    finally:
        try:
            await pubsub.aclose()
            await client.aclose()
        except (RedisError, OSError):
            pass