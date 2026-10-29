import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.organization_role import OrganizationRole


SLUG_PATTERN = re.compile(
    r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
)


def normalize_organization_name(value: str) -> str:
    value = value.strip()

    if not value:
        raise ValueError(
            "Organization name cannot be empty"
        )

    return value


def validate_organization_slug(value: str) -> str:
    if not SLUG_PATTERN.fullmatch(value):
        raise ValueError(
            "Slug must contain only lowercase letters, numbers and hyphens"
        )

    return value


class CreateOrganizationRequest(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=255,
    )

    slug: str = Field(
        min_length=1,
        max_length=100,
    )

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_organization_name(value)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        return validate_organization_slug(value)


class UpdateOrganizationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )

    slug: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str:
        if value is None:
            raise ValueError(
                "Organization name cannot be null"
            )

        return normalize_organization_name(value)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str:
        if value is None:
            raise ValueError(
                "Organization slug cannot be null"
            )

        return validate_organization_slug(value)

    @field_validator("is_active")
    @classmethod
    def validate_is_active(cls, value: bool | None) -> bool:
        if value is None:
            raise ValueError(
                "Organization active state cannot be null"
            )

        return value


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

class OrganizationListItemResponse(OrganizationResponse):
    members_count: int


class OrganizationMemberResponse(BaseModel):
    user_id: uuid.UUID
    email: str
    user_is_active: bool
    user_is_verified: bool
    is_superuser: bool
    role: OrganizationRole
    membership_is_active: bool
