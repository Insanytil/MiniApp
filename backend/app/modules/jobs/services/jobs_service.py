import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.task_dispatcher import dispatch_email_job, revoke_job
from app.models.background_job import (
    BackgroundJob,
    BackgroundJobStatus,
    BackgroundJobType,
)
from app.modules.jobs.exceptions import (
    BackgroundJobActionNotAllowedError,
    BackgroundJobNotFoundError,
)
from app.modules.jobs.events import publish_job_updated
from app.modules.jobs.repository.jobs_repository import BackgroundJobRepository
from app.modules.jobs.schemas.background_job_schemas import (
    BackgroundJobGroupResponse,
    BackgroundJobListParams,
    BackgroundJobResponse,
)


class BackgroundJobService:
    def __init__(self, db: AsyncSession, repository: BackgroundJobRepository):
        self.db = db
        self.repository = repository

    def create_email_job(
        self,
        *,
        job_type: BackgroundJobType,
        recipient_email: str,
        subject_user_id: uuid.UUID,
        organization_id: uuid.UUID | None,
        triggered_by_user_id: uuid.UUID | None,
        batch_id: uuid.UUID | None = None,
    ) -> BackgroundJob:
        job = BackgroundJob(
            type=job_type,
            recipient_email=recipient_email,
            celery_task_id=str(uuid.uuid4()),
            subject_user_id=subject_user_id,
            organization_id=organization_id,
            triggered_by_user_id=triggered_by_user_id,
            batch_id=batch_id,
            status=BackgroundJobStatus.QUEUED,
        )
        self.db.add(job)
        return job

    async def list_jobs(
        self,
        *,
        params: BackgroundJobListParams,
        organization_id: uuid.UUID | None,
    ) -> tuple[list[BackgroundJobGroupResponse], int]:
        rows = await self.repository.get_paginated_groups(
            organization_id=organization_id,
            search=params.search,
            status=params.status,
            job_type=params.type,
            offset=params.offset,
            limit=params.page_size,
        )
        total = await self.repository.count_filtered(
            organization_id=organization_id,
            search=params.search,
            status=params.status,
            job_type=params.type,
        )
        return [BackgroundJobGroupResponse(**row.__dict__) for row in rows], total

    async def list_batch_jobs(
        self,
        *,
        batch_id: uuid.UUID,
        organization_id: uuid.UUID | None,
    ) -> list[BackgroundJobResponse]:
        rows = await self.repository.get_batch_jobs(
            batch_id=batch_id,
            organization_id=organization_id,
        )
        return [
            self.to_response(job, organization_name, triggered_by_email)
            for job, organization_name, triggered_by_email in rows
        ]

    async def dispatch(self, job: BackgroundJob) -> bool:
        dispatched = dispatch_email_job(
            job_id=job.id,
            task_id=uuid.UUID(job.celery_task_id),
        )
        if dispatched:
            await publish_job_updated(job)
            return True
        job.status = BackgroundJobStatus.FAILED
        job.last_error = "The job could not be published to Redis"
        job.finished_at = datetime.now(UTC)
        await self.db.commit()
        await publish_job_updated(job)
        return False

    async def cancel(
        self,
        *,
        job_id: uuid.UUID,
        organization_id: uuid.UUID | None,
    ) -> None:
        job = await self._get_job(job_id, organization_id)
        if job.status != BackgroundJobStatus.QUEUED:
            raise BackgroundJobActionNotAllowedError()
        job.status = BackgroundJobStatus.CANCELLED
        job.finished_at = datetime.now(UTC)
        await self.db.commit()
        await publish_job_updated(job)
        revoke_job(task_id=uuid.UUID(job.celery_task_id))

    async def retry(
        self,
        *,
        job_id: uuid.UUID,
        organization_id: uuid.UUID | None,
    ) -> bool:
        job = await self._get_job(job_id, organization_id)
        if job.status not in {
            BackgroundJobStatus.FAILED,
            BackgroundJobStatus.CANCELLED,
        }:
            raise BackgroundJobActionNotAllowedError()
        job.status = BackgroundJobStatus.QUEUED
        job.last_error = None
        job.attempts = 0
        job.celery_task_id = str(uuid.uuid4())
        job.started_at = None
        job.finished_at = None
        await self.db.commit()
        dispatched = dispatch_email_job(
            job_id=job.id,
            task_id=uuid.UUID(job.celery_task_id),
        )
        if not dispatched:
            job.status = BackgroundJobStatus.FAILED
            job.last_error = "The job could not be published to Redis"
            job.finished_at = datetime.now(UTC)
            await self.db.commit()
        return dispatched

    async def _get_job(
        self,
        job_id: uuid.UUID,
        organization_id: uuid.UUID | None,
    ) -> BackgroundJob:
        job = await self.repository.get_by_id(
            job_id=job_id,
            organization_id=organization_id,
            for_update=True,
        )
        if job is None:
            raise BackgroundJobNotFoundError()
        return job

    @staticmethod
    def to_response(
        job: BackgroundJob,
        organization_name: str | None,
        triggered_by_email: str | None,
    ) -> BackgroundJobResponse:
        return BackgroundJobResponse(
            id=job.id,
            organization_id=job.organization_id,
            organization_name=organization_name,
            triggered_by_user_id=job.triggered_by_user_id,
            triggered_by_email=triggered_by_email,
            batch_id=job.batch_id,
            recipient_email=job.recipient_email,
            type=job.type,
            status=job.status,
            attempts=job.attempts,
            max_attempts=job.max_attempts,
            last_error=job.last_error,
            created_at=job.created_at,
            started_at=job.started_at,
            finished_at=job.finished_at,
        )