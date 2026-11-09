import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session
from app.modules.authorisation.dependencies import CurrentOrganizationScope, OrganizationAdminScope
from app.modules.files.schemas import DownloadResponse, FileResponse, UploadRequest, UploadResponse, FileNameRequest, FileAvailabilityRequest, FileManagerResponse
from app.modules.files.service import FileService
from app.modules.files.storage import S3Storage, get_storage

router = APIRouter(prefix="/organization/files", tags=["files"])


def get_file_service(
    db: AsyncSession = Depends(get_async_session), storage: S3Storage = Depends(get_storage),
) -> FileService:
    return FileService(db, storage)


Service = Annotated[FileService, Depends(get_file_service)]


@router.post("/uploads", response_model=UploadResponse, status_code=201)
async def create_upload(payload: UploadRequest, scope: CurrentOrganizationScope, service: Service):
    return await service.create_upload(payload, scope)


@router.post("/{file_id}/complete", response_model=FileResponse)
async def complete_upload(file_id: uuid.UUID, scope: CurrentOrganizationScope, service: Service):
    return await service.complete_upload(file_id, scope)


@router.get("", response_model=list[FileResponse])
async def list_files(scope: CurrentOrganizationScope, service: Service,
                     offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                     search: str | None = Query(None, max_length=255), images_only: bool = False):
    return await service.list_files(
        scope.organization.id, offset=offset, limit=limit, search=search, images_only=images_only,
    )


@router.get("/{file_id}/download", response_model=DownloadResponse)
async def download_file(file_id: uuid.UUID, scope: CurrentOrganizationScope, service: Service,
                        response: Response, preview: bool = False):
    response.headers["Cache-Control"] = "no-store"
    return await service.download_file(file_id, scope, preview=preview)


@router.delete("/{file_id}", status_code=204)
async def delete_file(file_id: uuid.UUID, scope: CurrentOrganizationScope, service: Service):
    await service.delete_file(file_id, scope)
    return Response(status_code=204)


@router.get("/manage", response_model=FileManagerResponse)
async def manage_files(scope: OrganizationAdminScope, service: Service,
                       offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
                       search: str | None = Query(None, max_length=255),
                       linked: bool | None = None, selectable: bool | None = None):
    return await service.list_managed(scope.organization.id, offset=offset, limit=limit,
                                      search=search, linked=linked, selectable=selectable)


@router.put("/{file_id}/name", response_model=FileResponse)
async def rename_file(file_id: uuid.UUID, payload: FileNameRequest,
                      scope: OrganizationAdminScope, service: Service):
    return await service.rename_file(file_id, scope, payload.filename)


@router.patch("/{file_id}/availability", response_model=FileResponse)
async def set_availability(file_id: uuid.UUID, payload: FileAvailabilityRequest,
                          scope: OrganizationAdminScope, service: Service):
    return await service.set_availability(file_id, scope, payload.is_selectable)
