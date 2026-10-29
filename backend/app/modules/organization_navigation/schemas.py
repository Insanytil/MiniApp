import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.entity_types.definitions import normalize_name
from app.modules.organization_navigation.rules import check_budget


MenuIcon = Literal[
    'folder', 'database', 'users', 'user-round', 'building-2', 'briefcase-business',
    'receipt', 'wallet', 'credit-card', 'shopping-cart', 'package', 'truck',
    'calendar-days', 'clipboard-list', 'file-text', 'chart-column', 'graduation-cap',
    'wrench', 'settings-2', 'heart', 'house', 'mail', 'star', 'tag',
]


class MenuCategory(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    kind: Literal['category']
    label: str = Field(min_length=1, max_length=100)
    icon: MenuIcon | None = None
    children: list['MenuNode'] = Field(default_factory=list, max_length=200)

    @field_validator('label')
    @classmethod
    def normalize_label(cls, value):
        return normalize_name(value)


class MenuEntity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    kind: Literal['entity']
    entity_type_id: uuid.UUID
    label: str | None = Field(default=None, max_length=100)
    icon: MenuIcon | None = None

    @field_validator('label')
    @classmethod
    def normalize_label(cls, value):
        return value.strip() or None if value is not None else None


MenuNode = Annotated[MenuCategory | MenuEntity, Field(discriminator='kind')]
MenuCategory.model_rebuild()


class MenuDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    nodes: list[MenuNode] = Field(default_factory=list, max_length=200)

    @model_validator(mode='before')
    @classmethod
    def validate_budget(cls, value):
        if isinstance(value, dict) and isinstance(value.get('nodes'), list):
            check_budget(value['nodes'])
        return value


class SaveMenuRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)
    document: MenuDocument


class MenuResponse(BaseModel):
    version: int
    document: MenuDocument
    resolved_nodes: list[dict]
    entity_types: list[dict]
