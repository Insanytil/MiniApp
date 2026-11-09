from fastapi import APIRouter
from typing import Annotated
import uuid
from fastapi import HTTPException, Query, status
from app.core.pagination import PagePaginatedResponse, PagePaginationMeta
from app.modules.jobs.dependencies import BackgroundJobServiceDep
from app.modules.jobs.exceptions import (
    BackgroundJobActionNotAllowedError,
    BackgroundJobNotFoundError,
)
from app.modules.jobs.schemas.background_job_schemas import (
    BackgroundJobGroupResponse,
    BackgroundJobListParams,
    BackgroundJobResponse,
)
from app.modules.platform_administration.schemas.platform_users_schemas import (
    EmailDispatchResponse,
)

router = APIRouter()


@router.get(
    "/jobs",
    response_model=PagePaginatedResponse[BackgroundJobGroupResponse],
)
async def get_platform_jobs(
    params: Annotated[BackgroundJobListParams, Query()],
    service: BackgroundJobServiceDep,
) -> PagePaginatedResponse[BackgroundJobGroupResponse]:
    jobs, total = await service.list_jobs(
        params=params,
        organization_id=params.organization_id,
    )
    return PagePaginatedResponse(
        items=jobs,
        pagination=PagePaginationMeta(
            page=params.page,
            page_size=params.page_size,
            total=total,
            total_pages=(total + params.page_size - 1) // params.page_size,
        ),
    )


@router.get(
    "/jobs/batches/{batch_id}",
    response_model=list[BackgroundJobResponse],
)
async def get_platform_job_batch(
    batch_id: uuid.UUID,
    service: BackgroundJobServiceDep,
) -> list[BackgroundJobResponse]:
    return await service.list_batch_jobs(batch_id=batch_id, organization_id=None)


@router.post("/jobs/{job_id}/retry", response_model=EmailDispatchResponse)
async def retry_platform_job(
    job_id: uuid.UUID,
    service: BackgroundJobServiceDep,
) -> EmailDispatchResponse:
    try:
        queued = await service.retry(job_id=job_id, organization_id=None)
    except BackgroundJobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Background job not found",
        ) from None
    except BackgroundJobActionNotAllowedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only failed or cancelled jobs can be retried",
        ) from None
    return EmailDispatchResponse(queued=queued)


@router.post(
    "/jobs/{job_id}/cancel",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_platform_job(
    job_id: uuid.UUID,
    service: BackgroundJobServiceDep,
) -> None:
    try:
        await service.cancel(job_id=job_id, organization_id=None)
    except BackgroundJobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Background job not found",
        ) from None
    except BackgroundJobActionNotAllowedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only queued jobs can be cancelled",
        ) from None
