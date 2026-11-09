import uuid
from collections.abc import Sequence

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.models.organization_role import OrganizationRole
from app.models.stored_file import StoredFile
from app.modules.authorisation.scope import OrganizationScope
from app.modules.files.exceptions import FileError
from app.modules.files.policy import IMAGE_CONTENT_TYPES, signed_url_lifetime
from app.modules.files.repository import FileRepository
from app.modules.files.schemas import DownloadResponse, FileResponse, UploadRequest, UploadResponse
from app.modules.files.storage import S3Storage


async def storage_call(func, *args):
    try:
        return await run_in_threadpool(func, *args)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            raise FileError(409, "Upload not found or expired") from None
        if code == "PreconditionFailed":
            raise FileError(409, "Upload changed; retry completion") from None
        raise FileError(503, "File storage unavailable") from None
    except BotoCoreError:
        raise FileError(503, "File storage unavailable") from None
    except ValueError as exc:
        raise FileError(422, str(exc)) from None



class FileService:
    def __init__(self, db: AsyncSession, storage: S3Storage):
        self.db = db
        self.storage = storage
        self.repository = FileRepository(db)

    async def get_file(self, organization_id: uuid.UUID, file_id: uuid.UUID, *, lock: bool = False) -> StoredFile:
        item = await self.repository.get_scoped(organization_id, file_id, lock=lock)
        if item is None:
            raise FileError(404, "File not found")
        return item

    async def create_upload(self, payload: UploadRequest, scope: OrganizationScope) -> UploadResponse:
        if payload.size_bytes > settings.s3_max_file_bytes:
            raise FileError(413, "File exceeds maximum size")
        file_id = uuid.uuid4()
        key = f"organizations/{scope.organization.id}/{file_id}"
        signed = await storage_call(self.storage.upload, key, payload.content_type, payload.size_bytes)
        item = StoredFile(id=file_id, organization_id=scope.organization.id, created_by=scope.user.id,
                          object_key=key, state="pending", **payload.model_dump())
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return UploadResponse(file=FileResponse.model_validate(item), **signed,
                              expires_in=signed_url_lifetime(settings.s3_url_lifetime_seconds))

    async def complete_upload(self, file_id: uuid.UUID, scope: OrganizationScope) -> StoredFile:
        item = await self.get_file(scope.organization.id, file_id, lock=True)
        if item.created_by != scope.user.id and not scope.user.is_superuser:
            raise FileError(403, "Only the uploader can complete this file")
        if item.state == "pending":
            await storage_call(self.storage.finalize, item.object_key, item.content_type, item.size_bytes)
            item.state = "ready"
            await self.db.commit()
            await self.db.refresh(item)
        return item

    async def list_files(self, organization_id: uuid.UUID, *, offset: int, limit: int) -> Sequence[StoredFile]:
        return await self.repository.list_ready(organization_id, offset=offset, limit=limit)

    async def download_file(self, file_id: uuid.UUID, scope: OrganizationScope, *, preview: bool) -> DownloadResponse:
        item = await self.get_file(scope.organization.id, file_id)
        if item.state != "ready":
            raise FileError(409, "File is not ready")
        inline = preview and item.content_type in IMAGE_CONTENT_TYPES
        url = await storage_call(self.storage.download, item.object_key, item.filename, inline)
        return DownloadResponse(url=url, expires_in=signed_url_lifetime(settings.s3_url_lifetime_seconds))

    async def delete_file(self, file_id: uuid.UUID, scope: OrganizationScope) -> None:
        item = await self.get_file(scope.organization.id, file_id, lock=True)
        if item.created_by != scope.user.id and scope.role != OrganizationRole.ADMIN and not scope.user.is_superuser:
            raise FileError(403, "Only uploader or administrator can delete this file")
        if await self.repository.is_linked(scope.organization.id, item.id):
            raise FileError(409, "File is linked to a record; remove the image from its fields first")
        await storage_call(self.storage.delete, item.object_key)
        item.state = "deleted"
        await self.db.commit()
