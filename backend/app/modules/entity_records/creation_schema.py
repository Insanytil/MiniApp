import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from app.modules.entity_types.configuration_schema import FieldDefinition


class RelationAssignment(BaseModel):
    model_config = ConfigDict(extra='forbid')
    relation_id: uuid.UUID
    direction: Literal['outgoing', 'incoming']
    record_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)


class CreateRecordRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_configuration_version: int = Field(ge=1)
    values: dict[uuid.UUID, JsonValue] = Field(default_factory=dict, max_length=200)
    relations: list[RelationAssignment] = Field(default_factory=list, max_length=200)


class CreationRelation(BaseModel):
    id: uuid.UUID
    name: str
    direction: Literal['outgoing', 'incoming']
    type_ids: list[uuid.UUID]
    target_types: list[dict[str, str]]
    many: bool
    required: bool


class RecordCreationSchema(BaseModel):
    id: uuid.UUID
    name: str
    configuration_version: int
    fields: list[FieldDefinition]
    relations: list[CreationRelation]


class RecordCreatedResponse(BaseModel):
    id: uuid.UUID
    entity_type_id: uuid.UUID


class UpdateRelationAssignment(RelationAssignment):
    # Existing inverse collections may exceed the creation limit. They must round-trip intact.
    record_ids: list[uuid.UUID] = Field(default_factory=list)


class UpdateRecordRequest(CreateRecordRequest):
    expected_updated_at: datetime
    relations: list[UpdateRelationAssignment] = Field(default_factory=list, max_length=200)


class RecordEditSchema(RecordCreationSchema):
    record_id: uuid.UUID
    updated_at: datetime
    values: dict[str, JsonValue]
    selections: dict[str, list[dict[str, str]]]
