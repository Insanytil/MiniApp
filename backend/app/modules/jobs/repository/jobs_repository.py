import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.background_job import (
    BackgroundJob,
    BackgroundJobStatus,
    BackgroundJobType,
)
from app.models.organization import Organization
from app.models.user import User


TriggeredByUser = aliased(User)


@dataclass(frozen=True)
class BackgroundJobGroupRow:
    id: uuid.UUID
    batch_id: uuid.UUID | None
    organization_id: uuid.UUID | None
    organization_name: str | None
    triggered_by_user_id: uuid.UUID | None
    triggered_by_email: str | None
    recipient_email: str | None
    type: BackgroundJobType
    total_jobs: int
    queued_jobs: int
    running_jobs: int
    succeeded_jobs: int
    failed_jobs: int
    cancelled_jobs: int
    attempts: int
    max_attempts: int
    last_error: str | None
    created_at: datetime
    latest_activity_at: datetime


class BackgroundJobRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _filtered_statement(
        self,
        *,
        organization_id: uuid.UUID | None,
        search: str | None,
        status: BackgroundJobStatus | None,
        job_type: BackgroundJobType | None,
    ):
        statement = select(BackgroundJob).outerjoin(
            Organization,
            Organization.id == BackgroundJob.organization_id,
        ).outerjoin(
            TriggeredByUser,
            TriggeredByUser.id == BackgroundJob.triggered_by_user_id,
        )
        if organization_id is not None:
            statement = statement.where(
                BackgroundJob.organization_id == organization_id
            )
        if search and search.strip():
            term = search.strip().lower()
            statement = statement.where(
                or_(
                    func.lower(BackgroundJob.recipient_email).contains(
                        term,
                        autoescape=True,
                    ),
                    func.lower(TriggeredByUser.email).contains(
                        term,
                        autoescape=True,
                    ),
                )
            )
        if status is not None:
            statement = statement.where(BackgroundJob.status == status)
        if job_type is not None:
            statement = statement.where(BackgroundJob.type == job_type)
        return statement

    async def get_paginated_groups(
        self,
        *,
        organization_id: uuid.UUID | None,
        search: str | None,
        status: BackgroundJobStatus | None,
        job_type: BackgroundJobType | None,
        offset: int,
        limit: int,
    ) -> list[BackgroundJobGroupRow]:
        group_id = func.coalesce(
            BackgroundJob.batch_id,
            BackgroundJob.id,
        )
        matched_groups = (
            self._filtered_statement(
                organization_id=organization_id,
                search=search,
                status=status,
                job_type=job_type,
            )
            .with_only_columns(
                group_id.label("group_id"),
                func.max(BackgroundJob.created_at).label("sort_created_at"),
            )
            .group_by(group_id)
            .subquery()
        )
        page_groups = (
            select(matched_groups)
            .order_by(matched_groups.c.sort_created_at.desc())
            .offset(offset)
            .limit(limit)
            .subquery()
        )
        statement = (
            select(
                page_groups.c.group_id,
                BackgroundJob.batch_id,
                BackgroundJob.organization_id,
                Organization.name,
                BackgroundJob.triggered_by_user_id,
                TriggeredByUser.email,
                func.max(BackgroundJob.recipient_email),
                BackgroundJob.type,
                func.count(BackgroundJob.id),
                func.count().filter(BackgroundJob.status == BackgroundJobStatus.QUEUED),
                func.count().filter(BackgroundJob.status == BackgroundJobStatus.RUNNING),
                func.count().filter(BackgroundJob.status == BackgroundJobStatus.SUCCEEDED),
                func.count().filter(BackgroundJob.status == BackgroundJobStatus.FAILED),
                func.count().filter(BackgroundJob.status == BackgroundJobStatus.CANCELLED),
                func.sum(BackgroundJob.attempts),
                func.max(BackgroundJob.max_attempts),
                func.max(BackgroundJob.last_error),
                func.min(BackgroundJob.created_at),
                func.max(BackgroundJob.updated_at),
            )
            .join(page_groups, page_groups.c.group_id == group_id)
            .outerjoin(Organization, Organization.id == BackgroundJob.organization_id)
            .outerjoin(TriggeredByUser, TriggeredByUser.id == BackgroundJob.triggered_by_user_id)
            .group_by(
                page_groups.c.group_id,
                page_groups.c.sort_created_at,
                BackgroundJob.batch_id,
                BackgroundJob.organization_id,
                Organization.name,
                BackgroundJob.triggered_by_user_id,
                TriggeredByUser.email,
                BackgroundJob.type,
            )
            .order_by(page_groups.c.sort_created_at.desc())
        )
        if organization_id is not None:
            statement = statement.where(
                BackgroundJob.organization_id == organization_id
            )
        rows = (await self.db.execute(statement)).tuples()
        return [BackgroundJobGroupRow(*row) for row in rows]

    async def count_filtered(
        self,
        *,
        organization_id: uuid.UUID | None,
        search: str | None,
        status: BackgroundJobStatus | None,
        job_type: BackgroundJobType | None,
    ) -> int:
        group_id = func.coalesce(BackgroundJob.batch_id, BackgroundJob.id)
        groups = (
            self._filtered_statement(
                organization_id=organization_id,
                search=search,
                status=status,
                job_type=job_type,
            )
            .with_only_columns(group_id.label("group_id"))
            .group_by(group_id)
            .subquery()
        )
        return await self.db.scalar(select(func.count()).select_from(groups)) or 0

    async def get_batch_jobs(
        self,
        *,
        batch_id: uuid.UUID,
        organization_id: uuid.UUID | None,
    ) -> list[tuple[BackgroundJob, str | None, str | None]]:
        statement = (
            select(BackgroundJob, Organization.name, TriggeredByUser.email)
            .outerjoin(Organization, Organization.id == BackgroundJob.organization_id)
            .outerjoin(TriggeredByUser, TriggeredByUser.id == BackgroundJob.triggered_by_user_id)
            .where(BackgroundJob.batch_id == batch_id)
            .order_by(BackgroundJob.created_at.asc())
        )
        if organization_id is not None:
            statement = statement.where(BackgroundJob.organization_id == organization_id)
        return list((await self.db.execute(statement)).tuples().all())

    async def get_by_id(
        self,
        *,
        job_id: uuid.UUID,
        organization_id: uuid.UUID | None,
        for_update: bool = False,
    ) -> BackgroundJob | None:
        statement = select(BackgroundJob).where(BackgroundJob.id == job_id)
        if organization_id is not None:
            statement = statement.where(
                BackgroundJob.organization_id == organization_id
            )
        if for_update:
            statement = statement.with_for_update()
        return await self.db.scalar(statement)