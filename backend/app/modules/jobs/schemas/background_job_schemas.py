import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.core.pagination import PagePaginationParams
from app.models.background_job import BackgroundJobStatus, BackgroundJobType


class BackgroundJobListParams(PagePaginationParams):
    search: str | None = Field(default=None, max_length=320)
    status: BackgroundJobStatus | None = None
    type: BackgroundJobType | None = None
    organization_id: uuid.UUID | None = None


class BackgroundJobResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    organization_name: str | None
    triggered_by_user_id: uuid.UUID | None
    triggered_by_email: str | None
    batch_id: uuid.UUID | None
    recipient_email: str | None
    type: BackgroundJobType
    status: BackgroundJobStatus
    attempts: int
    max_attempts: int
    last_error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class BackgroundJobGroupResponse(BaseModel):
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