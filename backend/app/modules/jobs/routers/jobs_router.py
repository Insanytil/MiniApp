import uuid

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.modules.authorisation.dependencies import (
    OrganizationAdminEventScope,
    PlatformEventAdmin,
)
from app.modules.jobs.events import stream_job_events


router = APIRouter(

    prefix="/jobs",
    tags=["background job events"])


def _event_response(
    request: Request,
    *,
    organization_id: uuid.UUID | None = None,
) -> StreamingResponse:
    return StreamingResponse(
        stream_job_events(request, organization_id=organization_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/platform/events", response_class=StreamingResponse)
async def stream_platform_job_events(
    request: Request,
    _admin: PlatformEventAdmin,
) -> StreamingResponse:
    return _event_response(request)


@router.get(
    "/organization-administration/events",
    response_class=StreamingResponse,
)
async def stream_organization_job_events(
    request: Request,
    scope: OrganizationAdminEventScope,
) -> StreamingResponse:
    return _event_response(
        request,
        organization_id=scope.organization.id,
    )