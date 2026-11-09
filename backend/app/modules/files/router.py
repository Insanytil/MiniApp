import uuid
from typing import Annotated
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, func, exists
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from app.core.config import settings
from app.db.session import get_async_session
from app.models.stored_file import StoredFile
from app.models.entity_record import EntityRecord
from app.models.organization_role import OrganizationRole
from app.modules.authorisation.dependencies import CurrentOrganizationScope
from app.modules.files.schemas import DownloadResponse, FileResponse, UploadRequest, UploadResponse
from app.modules.files.storage import S3Storage, get_storage

router = APIRouter(prefix="/organization/files", tags=["files"])
DB = Annotated[AsyncSession, Depends(get_async_session)]
Storage = Annotated[S3Storage, Depends(get_storage)]


def lifetime():
    return min(settings.s3_url_lifetime_seconds, 3600)


async def storage_call(func, *args):
    try:
        return await run_in_threadpool(func, *args)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            raise HTTPException(409, "Upload not found or expired") from None
        if code == "PreconditionFailed":
            raise HTTPException(409, "Upload changed; retry completion") from None
        raise HTTPException(503, "File storage unavailable") from None
    except BotoCoreError:
        raise HTTPException(503, "File storage unavailable") from None
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None


async def scoped_file(db, organization_id, file_id, lock=False):
    query = select(StoredFile).where(StoredFile.id == file_id,
        StoredFile.organization_id == organization_id, StoredFile.state != "deleted")
    if lock:
        query = query.with_for_update()
    item = await db.scalar(query)
    if item is None:
        raise HTTPException(404, "File not found")
    return item


@router.post("/uploads", response_model=UploadResponse, status_code=201)
async def create_upload(payload: UploadRequest, scope: CurrentOrganizationScope, db: DB, storage: Storage):
    if payload.size_bytes > settings.s3_max_file_bytes:
        raise HTTPException(413, "File exceeds maximum size")
    file_id = uuid.uuid4()
    key = f"organizations/{scope.organization.id}/{file_id}"
    signed = await storage_call(storage.upload, key, payload.content_type, payload.size_bytes)
    item = StoredFile(id=file_id, organization_id=scope.organization.id, created_by=scope.user.id,
                      object_key=key, state="pending", **payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return UploadResponse(file=FileResponse.model_validate(item), **signed, expires_in=lifetime())


@router.post("/{file_id}/complete", response_model=FileResponse)
async def complete_upload(file_id: uuid.UUID, scope: CurrentOrganizationScope, db: DB, storage: Storage):
    item = await scoped_file(db, scope.organization.id, file_id, lock=True)
    if item.created_by != scope.user.id and not scope.user.is_superuser:
        raise HTTPException(403, "Only the uploader can complete this file")
    if item.state == "pending":
        await storage_call(storage.finalize, item.object_key, item.content_type, item.size_bytes)
        item.state = "ready"
        await db.commit()
        await db.refresh(item)
    return item


@router.get("", response_model=list[FileResponse])
async def list_files(scope: CurrentOrganizationScope, db: DB,
                     offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
    return (await db.scalars(select(StoredFile).where(
        StoredFile.organization_id == scope.organization.id, StoredFile.state == "ready"
    ).order_by(StoredFile.created_at.desc(), StoredFile.id).offset(offset).limit(limit))).all()


@router.get("/{file_id}/download", response_model=DownloadResponse)
async def download_file(file_id: uuid.UUID, scope: CurrentOrganizationScope, db: DB, storage: Storage,
                        response: Response, preview: bool = False):
    response.headers["Cache-Control"] = "no-store"
    item = await scoped_file(db, scope.organization.id, file_id)
    if item.state != "ready":
        raise HTTPException(409, "File is not ready")
    inline = preview and item.content_type in {"image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"}
    url = await storage_call(storage.download, item.object_key, item.filename, inline)
    return DownloadResponse(url=url, expires_in=lifetime())


@router.delete("/{file_id}", status_code=204)
async def delete_file(file_id: uuid.UUID, scope: CurrentOrganizationScope, db: DB, storage: Storage):
    item = await scoped_file(db, scope.organization.id, file_id, lock=True)
    if item.created_by != scope.user.id and scope.role != OrganizationRole.ADMIN and not scope.user.is_superuser:
        raise HTTPException(403, "Only uploader or administrator can delete this file")
    values = func.jsonb_each_text(EntityRecord.values).table_valued("key", "value").alias("file_values")
    linked = await db.scalar(select(EntityRecord.id).where(
        EntityRecord.organization_id == scope.organization.id,
        exists(select(1).select_from(values).where(values.c.value == f"file:{item.id}")),
    ).limit(1))
    if linked is not None:
        raise HTTPException(409, "File is linked to a record; remove the image from its fields first")
    await storage_call(storage.delete, item.object_key)
    item.state = "deleted"
    await db.commit()
    return Response(status_code=204)
