import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session
from app.modules.authorisation.dependencies import CurrentOrganizationScope
from app.modules.files.schemas import DownloadResponse, FileResponse, UploadRequest, UploadResponse
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
                     offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
    return await service.list_files(scope.organization.id, offset=offset, limit=limit)


@router.get("/{file_id}/download", response_model=DownloadResponse)
async def download_file(file_id: uuid.UUID, scope: CurrentOrganizationScope, service: Service,
                        response: Response, preview: bool = False):
    response.headers["Cache-Control"] = "no-store"
    return await service.download_file(file_id, scope, preview=preview)


@router.delete("/{file_id}", status_code=204)
async def delete_file(file_id: uuid.UUID, scope: CurrentOrganizationScope, service: Service):
    await service.delete_file(file_id, scope)
    return Response(status_code=204)
