import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from celery.exceptions import Ignore
from sqlalchemy import select

from app.core.config import settings
from app.core.email import SmtpEmailSender
from app.core.security import generate_secret, hash_secret, session_expiry
from app.db.session import async_session_factory
from app.models.background_job import (
    BackgroundJob,
    BackgroundJobStatus,
    BackgroundJobType,
)
from app.models.user import User
from app.modules.auth.repository.invitation_repository import UserInvitationRepository
from app.modules.auth.repository.password_reset_repository import PasswordResetTokenRepository
from app.modules.jobs.events import publish_job_updated
from app.workers.celery_app import celery_app


class PermanentEmailJobError(Exception):
    pass


class EmailJobAlreadyRunningError(Exception):
    pass


_worker_event_loop: asyncio.AbstractEventLoop | None = None


def _run_async(coroutine):
    global _worker_event_loop
    if _worker_event_loop is None or _worker_event_loop.is_closed():
        _worker_event_loop = asyncio.new_event_loop()
    return _worker_event_loop.run_until_complete(coroutine)


def _email_sender() -> SmtpEmailSender:
    return SmtpEmailSender(
        host=settings.smtp_host,
        port=settings.smtp_port,
        sender_email=settings.smtp_sender_email,
        frontend_base_url=settings.frontend_base_url,
    )


async def _process_email_job(job_id: uuid.UUID) -> None:
    async with async_session_factory() as session:
        job = await session.scalar(
            select(BackgroundJob)
            .where(BackgroundJob.id == job_id)
            .with_for_update()
        )
        if job is None or job.status in {
            BackgroundJobStatus.SUCCEEDED,
            BackgroundJobStatus.FAILED,
            BackgroundJobStatus.CANCELLED,
        }:
            return
        if (
            job.status == BackgroundJobStatus.RUNNING
            and job.started_at is not None
            and job.started_at > datetime.now(UTC) - timedelta(minutes=2)
        ):
            raise EmailJobAlreadyRunningError()

        job.status = BackgroundJobStatus.RUNNING
        job.attempts += 1
        job.started_at = datetime.now(UTC)
        job.finished_at = None
        job.last_error = None
        await session.commit()
        await publish_job_updated(job)

        if job.subject_user_id is None:
            raise PermanentEmailJobError("The target user no longer exists")
        if job.recipient_email is None:
            raise PermanentEmailJobError("The email job has no recipient")
        user = await session.scalar(
            select(User).where(User.id == job.subject_user_id)
        )
        if user is None:
            raise PermanentEmailJobError("The target user no longer exists")

        token = generate_secret()
        if job.type == BackgroundJobType.ACCOUNT_VERIFICATION_EMAIL:
            if user.is_verified:
                raise PermanentEmailJobError("The account is already verified")
            await UserInvitationRepository(session).replace_for_user(
                user_id=user.id,
                token_hash=hash_secret(token),
                expires_at=session_expiry(
                    timedelta(hours=settings.invitation_lifetime_hours)
                ),
            )
        elif job.type == BackgroundJobType.PASSWORD_RESET_EMAIL:
            if not user.is_verified:
                raise PermanentEmailJobError("The account is not verified")
            await PasswordResetTokenRepository(session).create_or_replace(
                user_id=user.id,
                token_hash=hash_secret(token),
                expires_at=session_expiry(
                    timedelta(minutes=settings.password_reset_lifetime_minutes)
                ),
            )
        else:
            raise PermanentEmailJobError("Unsupported email job type")
        await session.commit()

        if job.type == BackgroundJobType.ACCOUNT_VERIFICATION_EMAIL:
            await _email_sender().send_account_invitation(
                recipient_email=job.recipient_email,
                token=token,
            )
        else:
            await _email_sender().send_password_reset(
                recipient_email=job.recipient_email,
                token=token,
            )

        job.status = BackgroundJobStatus.SUCCEEDED
        job.finished_at = datetime.now(UTC)
        await session.commit()
        await publish_job_updated(job)


async def _record_failure(
    job_id: uuid.UUID,
    error: Exception,
    *,
    final: bool,
) -> None:
    async with async_session_factory() as session:
        job = await session.scalar(
            select(BackgroundJob)
            .where(BackgroundJob.id == job_id)
            .with_for_update()
        )
        if job is None or job.status == BackgroundJobStatus.CANCELLED:
            return
        job.status = (
            BackgroundJobStatus.FAILED if final else BackgroundJobStatus.QUEUED
        )
        job.last_error = str(error)[:2000] or error.__class__.__name__
        job.finished_at = datetime.now(UTC) if final else None
        await session.commit()
        await publish_job_updated(job)


@celery_app.task(
    bind=True,
    max_retries=5,
    name="progressia.email.process",
)
def process_email_job_task(self, *, job_id: str) -> None:
    parsed_job_id = uuid.UUID(job_id)
    try:
        _run_async(_process_email_job(parsed_job_id))
    except EmailJobAlreadyRunningError as exc:
        raise self.retry(exc=exc, countdown=30)
    except PermanentEmailJobError as exc:
        _run_async(_record_failure(parsed_job_id, exc, final=True))
        raise Ignore() from exc
    except Exception as exc:
        final = self.request.retries >= self.max_retries
        _run_async(_record_failure(parsed_job_id, exc, final=final))
        if final:
            raise
        raise self.retry(
            exc=exc,
            countdown=min(300, 2 ** (self.request.retries + 1)),
        )