import uuid
from collections.abc import Sequence

from sqlalchemy import exists, func, select, cast, String, literal, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entity_record import EntityRecord
from app.models.stored_file import StoredFile
from app.modules.files.policy import IMAGE_CONTENT_TYPES


class FileRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_scoped(self, organization_id: uuid.UUID, file_id: uuid.UUID, *, lock: bool = False) -> StoredFile | None:
        query = select(StoredFile).where(
            StoredFile.id == file_id,
            StoredFile.organization_id == organization_id,
            StoredFile.state != "deleted",
        )
        return await self.db.scalar(query.with_for_update() if lock else query)

    async def list_ready(
        self, organization_id: uuid.UUID, *, offset: int, limit: int,
        search: str | None = None, images_only: bool = False,
    ) -> Sequence[StoredFile]:
        query = select(StoredFile).where(
            StoredFile.organization_id == organization_id, StoredFile.state == "ready",
            StoredFile.is_selectable.is_(True),
        )
        if search and search.strip():
            query = query.where(func.lower(StoredFile.filename).contains(search.strip().lower(), autoescape=True))
        if images_only:
            query = query.where(StoredFile.content_type.in_(IMAGE_CONTENT_TYPES))
        result = await self.db.scalars(query.order_by(
            StoredFile.created_at.desc(), StoredFile.id,
        ).offset(offset).limit(limit))
        return result.all()

    async def list_managed(
        self, organization_id: uuid.UUID, *, offset: int, limit: int,
        search: str | None = None, linked: bool | None = None, selectable: bool | None = None,
    ):
        values = func.jsonb_each_text(EntityRecord.values).table_valued("key", "value").alias("file_values")
        usage_count = select(func.count()).select_from(EntityRecord).where(
            EntityRecord.organization_id == organization_id,
            exists(select(1).select_from(values).where(
                values.c.value == literal("file:") + cast(StoredFile.id, String),
            ).correlate(EntityRecord, StoredFile)),
        ).correlate(StoredFile).scalar_subquery()
        query = select(StoredFile, usage_count.label("usage_count")).where(
            StoredFile.organization_id == organization_id, StoredFile.state != "deleted",
        )
        if search and search.strip():
            query = query.where(func.lower(StoredFile.filename).contains(search.strip().lower(), autoescape=True))
        if linked is not None:
            query = query.where(usage_count > 0 if linked else usage_count == 0)
        if selectable is True:
            query = query.where(StoredFile.is_selectable.is_(True), StoredFile.state == "ready")
        elif selectable is False:
            query = query.where(or_(StoredFile.is_selectable.is_(False), StoredFile.state != "ready"))
        total = await self.db.scalar(select(func.count()).select_from(query.subquery()))
        rows = await self.db.execute(query.order_by(StoredFile.created_at.desc(), StoredFile.id).offset(offset).limit(limit))
        return rows.all(), total or 0

    async def is_linked(self, organization_id: uuid.UUID, file_id: uuid.UUID) -> bool:
        values = func.jsonb_each_text(EntityRecord.values).table_valued("key", "value").alias("file_values")
        record_id = await self.db.scalar(select(EntityRecord.id).where(
            EntityRecord.organization_id == organization_id,
            exists(select(1).select_from(values).where(values.c.value == f"file:{file_id}")),
        ).limit(1))
        return record_id is not None
