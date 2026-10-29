import uuid
from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.pagination import PagePaginationParams
from app.models.organization_role import OrganizationRole
from app.modules.platform_administration.schemas.platform_users_schemas import EMAIL_PATTERN


class OrganizationUserListParams(PagePaginationParams):
    model_config = ConfigDict(extra="forbid")
    search: str | None = Field(default=None, max_length=320)


class CreateOrganizationUserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=320)
    role: OrganizationRole

    @model_validator(mode="after")
    def normalize_email(self) -> Self:
        self.email = self.email.strip().lower()
        if not EMAIL_PATTERN.fullmatch(self.email):
            raise ValueError("Invalid email address")
        return self


class UpdateOrganizationUserAccessRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_active: bool


class OrganizationUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    is_active: bool
    is_verified: bool
    membership_is_active: bool
    role: OrganizationRole
    created_at: datetime


class CreateOrganizationUserResponse(BaseModel):
    user: OrganizationUserResponse
    invitation_queued: bool
