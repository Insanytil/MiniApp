"""Versioned, declarative metadata. References use UUIDs, never display names."""
import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.entity_types.definitions import normalize_name, validate_technical_name


class Definition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)

    @field_validator("name")
    @classmethod
    def normalize_label(cls, value: str) -> str:
        return normalize_name(value)


class ChoiceOption(Definition):
    color: Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")] | Literal[
        "blue", "green", "amber", "red", "purple", "pink"
    ] | None = None


class FieldDefinition(Definition):
    technical_name: str = Field(min_length=1, max_length=100)
    kind: Literal["text", "email", "integer", "decimal", "boolean", "date", "datetime", "image", "choice", "phone", "address"]
    required: bool = False
    options: list[ChoiceOption] = Field(default_factory=list, max_length=100)
    multiple: bool = False

    @model_validator(mode="after")
    def validate_options(self):
        if self.kind != "choice":
            if self.options or self.multiple:
                raise ValueError("Les options sont réservées aux listes de choix.")
            return self
        if not self.options:
            raise ValueError("Ajoutez au moins une option.")
        if len({option.id for option in self.options}) != len(self.options):
            raise ValueError("Les identifiants d’option doivent être uniques.")
        if len({option.name.casefold() for option in self.options}) != len(self.options):
            raise ValueError("Les libellés d’option doivent être uniques.")
        return self

    @field_validator("technical_name")
    @classmethod
    def validate_identifier(cls, value: str) -> str:
        return validate_technical_name(value)


class RelationDefinition(Definition):
    technical_name: str = Field(min_length=1, max_length=100)
    target_type_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)
    inverse_name: str = Field(min_length=1, max_length=255)
    source_max: Literal[1] | None = 1
    target_max: Literal[1] | None = None
    required: bool = False
    on_delete: Literal["restrict", "unlink"] = "restrict"

    @field_validator("technical_name")
    @classmethod
    def validate_identifier(cls, value: str) -> str:
        return validate_technical_name(value)

    @field_validator("inverse_name")
    @classmethod
    def validate_inverse_label(cls, value: str) -> str:
        return normalize_name(value)


class DisplayProfile(Definition):
    title_fields: list[uuid.UUID] = Field(min_length=1, max_length=8)
    secondary_fields: list[uuid.UUID] = Field(default_factory=list, max_length=8)
    image_field: uuid.UUID | None = None
    separator: str = Field(default=" ", max_length=10)
    is_default: bool = False


class ViewColumn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    label: str = Field(min_length=1, max_length=255)
    kind: Literal["field", "display", "relation", "count"]
    field_id: uuid.UUID | None = None
    relation_id: uuid.UUID | None = None
    direction: Literal["outgoing", "incoming"] = "outgoing"
    profile_id: uuid.UUID | None = None
    collection_display: Literal["list", "first"] = "list"

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: str) -> str:
        return normalize_name(value)


class ViewDefinition(Definition):
    columns: list[ViewColumn] = Field(min_length=1, max_length=50)
    is_default: bool = False


class EntityConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    fields: list[FieldDefinition] = Field(default_factory=list, max_length=200)
    relations: list[RelationDefinition] = Field(default_factory=list, max_length=100)
    display_profiles: list[DisplayProfile] = Field(default_factory=list, max_length=50)
    views: list[ViewDefinition] = Field(default_factory=list, max_length=50)


class SystemFieldDefinition(FieldDefinition):
    system: Literal[True] = True


class SaveConfigurationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)
    configuration: EntityConfiguration
