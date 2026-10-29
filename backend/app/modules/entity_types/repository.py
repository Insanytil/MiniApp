import uuid

from sqlalchemy import String, func, or_, select, type_coerce, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entity_type import EntityType
from app.models.organization import Organization
from app.models.entity_record import EntityRecord
from app.modules.organization_navigation.rules import referenced_types


class EntityTypeRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_types(self, *, organization_id: uuid.UUID, search: str | None, offset: int, limit: int):
        statement = select(EntityType).where(EntityType.organization_id == organization_id)
        if search and search.strip():
            term = search.strip().lower()
            statement = statement.where(or_(
                type_coerce(func.lower(EntityType.name), String).contains(term, autoescape=True),
                EntityType.technical_name.contains(term, autoescape=True),
            ))
        total = await self.db.scalar(select(func.count()).select_from(statement.subquery()))
        rows = await self.db.scalars(statement.order_by(EntityType.name, EntityType.id).offset(offset).limit(limit))
        return list(rows.all()), total or 0

    async def get_by_id(self, *, organization_id: uuid.UUID, entity_type_id: uuid.UUID):
        return await self.db.scalar(select(EntityType).where(
            EntityType.organization_id == organization_id, EntityType.id == entity_type_id,
        ).with_for_update())

    async def get_by_technical_name(self, *, organization_id: uuid.UUID, technical_name: str):
        return await self.db.scalar(select(EntityType).where(
            EntityType.organization_id == organization_id, EntityType.technical_name == technical_name,
        ))

    async def create(self, **values) -> EntityType:
        entity_type = EntityType(**values)
        self.db.add(entity_type)
        await self.db.flush()
        return entity_type

    async def delete(self, entity_type: EntityType) -> None:
        await self.db.delete(entity_type)


    async def lock_configuration(self, organization_id: uuid.UUID) -> None:
        # Serialize schema mutations per organization, including dependency checks.
        await self.db.scalar(select(Organization.id).where(Organization.id == organization_id).with_for_update())

    async def catalog(self, organization_id: uuid.UUID) -> list[EntityType]:
        return list((await self.db.scalars(select(EntityType).where(
            EntityType.organization_id == organization_id,
        ).order_by(EntityType.name, EntityType.id))).all())


    async def definition_counts(self, organization_id: uuid.UUID):
        # Avoid fetching all profiles and views just to show counters in the list.
        rows = list((await self.db.execute(select(
            EntityType.id, func.jsonb_array_length(EntityType.configuration["fields"]),
            EntityType.configuration["relations"],
        ).where(EntityType.organization_id == organization_id))).all())
        result = {str(type_id): {"fields": field_count, "relations": 0}
                  for type_id, field_count, _ in rows}
        for type_id, _, relations in rows:
            for relation in relations:
                for affected in {str(type_id), *relation["target_type_ids"]}:
                    if affected in result:
                        result[affected]["relations"] += 1
        return result

    async def has_records(self, organization_id, entity_type_id):
        return bool(await self.db.scalar(select(exists().where(
            EntityRecord.organization_id == organization_id, EntityRecord.entity_type_id == entity_type_id,
        ))))

    async def used_in_menu(self, organization_id, entity_type_id):
        document = await self.db.scalar(select(Organization.navigation).where(Organization.id == organization_id))
        return str(entity_type_id) in referenced_types((document or {'nodes': []})['nodes'])
