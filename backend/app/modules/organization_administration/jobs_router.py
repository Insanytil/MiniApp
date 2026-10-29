import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import ConfigDict, Field

from app.core.pagination import PagePaginatedResponse, PagePaginationMeta, PagePaginationParams
from app.models.background_job import BackgroundJobStatus, BackgroundJobType
from app.modules.authorisation.dependencies import OrganizationAdminScope
from app.modules.jobs.dependencies import BackgroundJobServiceDep
from app.modules.jobs.exceptions import BackgroundJobActionNotAllowedError, BackgroundJobNotFoundError
from app.modules.jobs.schemas.background_job_schemas import (
    BackgroundJobGroupResponse,
    BackgroundJobListParams,
    BackgroundJobResponse,
)
from app.modules.platform_administration.schemas.platform_users_schemas import EmailDispatchResponse


class OrganizationJobListParams(PagePaginationParams):
    model_config = ConfigDict(extra="forbid")
    search: str | None = Field(default=None, max_length=320)
    status: BackgroundJobStatus | None = None
    type: BackgroundJobType | None = None


router = APIRouter(prefix="/organization/jobs", tags=["organization administration"])


@router.get("", response_model=PagePaginatedResponse[BackgroundJobGroupResponse])
async def list_organization_jobs(
    params: Annotated[OrganizationJobListParams, Query()],
    scope: OrganizationAdminScope,
    service: BackgroundJobServiceDep,
) -> PagePaginatedResponse[BackgroundJobGroupResponse]:
    jobs, total = await service.list_jobs(
        params=BackgroundJobListParams(**params.model_dump()),
        organization_id=scope.organization.id,
    )
    return PagePaginatedResponse(
        items=jobs,
        pagination=PagePaginationMeta(
            page=params.page, page_size=params.page_size, total=total,
            total_pages=(total + params.page_size - 1) // params.page_size,
        ),
    )


@router.get("/batches/{batch_id}", response_model=list[BackgroundJobResponse])
async def get_organization_job_batch(
    batch_id: uuid.UUID,
    scope: OrganizationAdminScope,
    service: BackgroundJobServiceDep,
) -> list[BackgroundJobResponse]:
    jobs = await service.list_batch_jobs(
        batch_id=batch_id, organization_id=scope.organization.id,
    )
    if not jobs:
        raise HTTPException(status_code=404, detail="Background job batch not found")
    return jobs


@router.post("/{job_id}/retry", response_model=EmailDispatchResponse)
async def retry_organization_job(
    job_id: uuid.UUID,
    scope: OrganizationAdminScope,
    service: BackgroundJobServiceDep,
) -> EmailDispatchResponse:
    try:
        queued = await service.retry(job_id=job_id, organization_id=scope.organization.id)
    except BackgroundJobNotFoundError:
        raise HTTPException(status_code=404, detail="Background job not found") from None
    except BackgroundJobActionNotAllowedError:
        raise HTTPException(status_code=409, detail="Only failed or cancelled jobs can be retried") from None
    return EmailDispatchResponse(queued=queued)


@router.post("/{job_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_organization_job(
    job_id: uuid.UUID,
    scope: OrganizationAdminScope,
    service: BackgroundJobServiceDep,
) -> None:
    try:
        await service.cancel(job_id=job_id, organization_id=scope.organization.id)
    except BackgroundJobNotFoundError:
        raise HTTPException(status_code=404, detail="Background job not found") from None
    except BackgroundJobActionNotAllowedError:
        raise HTTPException(status_code=409, detail="Only queued jobs can be cancelled") from None
