import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.pagination import PagePaginationParams
from app.modules.entity_types.configuration_schema import EntityConfiguration, SystemFieldDefinition
from app.modules.entity_types.definitions import normalize_name, validate_technical_name


class EntityTypeListParams(PagePaginationParams):
    model_config = ConfigDict(extra="forbid")
    search: str | None = Field(default=None, max_length=255)


class CreateEntityTypeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=255)
    technical_name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return normalize_name(value)

    @field_validator("technical_name")
    @classmethod
    def validate_identifier(cls, value: str) -> str:
        return validate_technical_name(value)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class UpdateEntityTypeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Name cannot be null")
        return normalize_name(value)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class EntityTypeResponse(BaseModel):
    id: uuid.UUID
    name: str
    technical_name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    fields_count: int
    relations_count: int
    system_fields: tuple[str, ...]


class EntityTypeConfigurationResponse(EntityTypeResponse):
    configuration_version: int
    configuration: EntityConfiguration
    available_system_fields: list[SystemFieldDefinition]
