import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entity_type import EntityType
from app.modules.entity_types.definitions import (
    SYSTEM_FIELD_NAMES, EntityTypeAlreadyExistsError, EntityTypeNotFoundError,
)
from app.modules.entity_types.repository import EntityTypeRepository
from app.modules.entity_types.schemas import (
    CreateEntityTypeRequest, EntityTypeListParams, EntityTypeResponse, UpdateEntityTypeRequest,
    EntityTypeConfigurationResponse,
)
from app.modules.entity_types.configuration_rules import (
    ConfigurationConflictError, ConfigurationError, empty_configuration, system_fields, validate_catalog, requires_data_migration,
)
from app.modules.entity_types.configuration_schema import SaveConfigurationRequest


class EntityTypeService:
    def __init__(self, db: AsyncSession, repository: EntityTypeRepository):
        self.db = db
        self.repository = repository

    async def list_types(self, *, organization_id: uuid.UUID, params: EntityTypeListParams):
        types, total = await self.repository.list_types(
            organization_id=organization_id, search=params.search,
            offset=params.offset, limit=params.page_size,
        )
        counts = await self.repository.definition_counts(organization_id)
        return [self.to_response(item, counts[str(item.id)]["relations"], counts[str(item.id)]["fields"])
                for item in types], total

    async def create(self, *, organization_id: uuid.UUID, actor_id: uuid.UUID, payload: CreateEntityTypeRequest):
        existing = await self.repository.get_by_technical_name(
            organization_id=organization_id, technical_name=payload.technical_name,
        )
        if existing is not None:
            raise EntityTypeAlreadyExistsError()
        try:
            entity_type = await self.repository.create(
                organization_id=organization_id, created_by=actor_id, updated_by=actor_id,
                **payload.model_dump(),
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            driver_error = getattr(exc.orig, "__cause__", None) or exc.orig
            if getattr(driver_error, "constraint_name", None) == "uq_entity_types_organization_technical_name":
                raise EntityTypeAlreadyExistsError() from None
            raise
        await self.db.refresh(entity_type)
        return self.to_response(entity_type)

    async def update(self, *, organization_id: uuid.UUID, actor_id: uuid.UUID, entity_type_id: uuid.UUID, payload: UpdateEntityTypeRequest):
        entity_type = await self.repository.get_by_id(organization_id=organization_id, entity_type_id=entity_type_id)
        if entity_type is None:
            raise EntityTypeNotFoundError()
        changes = payload.model_dump(exclude_unset=True)
        # Keep the technical identifier immutable even for internal callers.
        changes = {key: value for key, value in changes.items() if key in {"name", "description"} and getattr(entity_type, key) != value}
        if changes:
            for key, value in changes.items():
                setattr(entity_type, key, value)
            entity_type.updated_by = actor_id
            await self.db.commit()
            await self.db.refresh(entity_type)
        counts = await self.repository.definition_counts(organization_id)
        stats = counts[str(entity_type.id)]
        return self.to_response(entity_type, stats["relations"], stats["fields"])

    async def delete(self, *, organization_id: uuid.UUID, entity_type_id: uuid.UUID):
        await self.repository.lock_configuration(organization_id)
        catalog = await self.repository.catalog(organization_id)
        entity_type = next((item for item in catalog if item.id == entity_type_id), None)
        if entity_type is None:
            raise EntityTypeNotFoundError()
        if await self.repository.used_in_menu(organization_id, entity_type_id):
            raise ConfigurationError("Retirez ce type du menu de l’organisation avant de le supprimer.")
        if await self.repository.has_records(organization_id, entity_type_id):
            raise ConfigurationError("Ce type contient des enregistrements et ne peut pas être supprimé.")
        remaining = {str(item.id): item.configuration for item in catalog if item.id != entity_type_id}
        validate_catalog(remaining)
        await self.repository.delete(entity_type)
        await self.db.commit()

    @staticmethod
    def to_response(entity_type: EntityType, relations_count: int | None = None, fields_count: int | None = None) -> EntityTypeResponse:
        config = entity_type.configuration or empty_configuration()
        return EntityTypeResponse(
            id=entity_type.id, name=entity_type.name, technical_name=entity_type.technical_name,
            description=entity_type.description, created_at=entity_type.created_at,
            updated_at=entity_type.updated_at, fields_count=fields_count if fields_count is not None else len(config["fields"]),
            relations_count=relations_count if relations_count is not None else len(config["relations"]),
            system_fields=SYSTEM_FIELD_NAMES,
        )


    @staticmethod
    def relation_counts(catalog):
        counts = {str(item.id): 0 for item in catalog}
        for item in catalog:
            for relation in item.configuration.get("relations", []):
                for type_id in {str(item.id), *relation["target_type_ids"]}:
                    counts[type_id] = counts.get(type_id, 0) + 1
        return counts

    async def configuration_catalog(self, *, organization_id: uuid.UUID):
        catalog = await self.repository.catalog(organization_id)
        counts = self.relation_counts(catalog)
        return [self.configuration_response(item, counts.get(str(item.id), 0)) for item in catalog]

    async def save_configuration(self, *, organization_id: uuid.UUID, actor_id: uuid.UUID,
                                 entity_type_id: uuid.UUID, payload: SaveConfigurationRequest):
        await self.repository.lock_configuration(organization_id)
        rows = await self.repository.catalog(organization_id)
        entity_type = next((item for item in rows if item.id == entity_type_id), None)
        if entity_type is None:
            raise EntityTypeNotFoundError()
        if entity_type.configuration_version != payload.expected_version:
            raise ConfigurationConflictError()
        previous = {str(item.id): item.configuration for item in rows}
        candidate = payload.configuration.model_dump(mode="json")
        validate_catalog({**previous, str(entity_type_id): candidate}, previous)
        if requires_data_migration(entity_type.configuration, candidate) and await self.repository.has_records(organization_id, entity_type_id):
            raise ConfigurationError("Cette modification de structure nécessite une migration des enregistrements existants.")
        entity_type.configuration = candidate
        entity_type.configuration_version += 1
        entity_type.updated_by = actor_id
        await self.db.commit()
        await self.db.refresh(entity_type)
        return self.configuration_response(entity_type, self.relation_counts(rows).get(str(entity_type_id), 0))

    @classmethod
    def configuration_response(cls, entity_type, relations_count=0):
        return EntityTypeConfigurationResponse(
            **cls.to_response(entity_type, relations_count).model_dump(),
            configuration_version=entity_type.configuration_version,
            configuration=entity_type.configuration,
            available_system_fields=system_fields(entity_type.id),
        )
