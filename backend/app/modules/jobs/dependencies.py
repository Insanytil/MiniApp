from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session
from app.modules.jobs.repository.jobs_repository import BackgroundJobRepository
from app.modules.jobs.services.jobs_service import BackgroundJobService


async def get_background_job_service(
    session: AsyncSession = Depends(get_async_session),
) -> BackgroundJobService:
    return BackgroundJobService(session, BackgroundJobRepository(session))


BackgroundJobServiceDep = Annotated[
    BackgroundJobService,
    Depends(get_background_job_service),
]