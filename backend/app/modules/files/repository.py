import uuid
from collections.abc import Sequence

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entity_record import EntityRecord
from app.models.stored_file import StoredFile


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

    async def list_ready(self, organization_id: uuid.UUID, *, offset: int, limit: int) -> Sequence[StoredFile]:
        result = await self.db.scalars(select(StoredFile).where(
            StoredFile.organization_id == organization_id, StoredFile.state == "ready",
        ).order_by(StoredFile.created_at.desc(), StoredFile.id).offset(offset).limit(limit))
        return result.all()

    async def is_linked(self, organization_id: uuid.UUID, file_id: uuid.UUID) -> bool:
        values = func.jsonb_each_text(EntityRecord.values).table_valued("key", "value").alias("file_values")
        record_id = await self.db.scalar(select(EntityRecord.id).where(
            EntityRecord.organization_id == organization_id,
            exists(select(1).select_from(values).where(values.c.value == f"file:{file_id}")),
        ).limit(1))
        return record_id is not None
