import uuid
from datetime import datetime
from typing import Self, Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

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


class UpdateOrganizationUserProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100, pattern=r'^[^\x00-\x1f\x7f]*$')]
    last_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100, pattern=r'^[^\x00-\x1f\x7f]*$')]


class OrganizationUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    display_name: str
    is_active: bool
    is_verified: bool
    membership_is_active: bool
    role: OrganizationRole
    created_at: datetime


class CreateOrganizationUserResponse(BaseModel):
    user: OrganizationUserResponse
    invitation_queued: bool
