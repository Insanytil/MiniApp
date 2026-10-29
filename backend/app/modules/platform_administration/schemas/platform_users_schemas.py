import re
import uuid
from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.pagination import PagePaginationParams
from app.models.organization_role import OrganizationRole


EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class PlatformUserListParams(PagePaginationParams):
    search: str | None = Field(default=None, max_length=320)
    organization_id: uuid.UUID | None = None
    is_active: bool | None = None


class CreatePlatformUserRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    organization_id: uuid.UUID | None = None
    role: OrganizationRole | None = None

    @model_validator(mode="after")
    def validate_request(self) -> Self:
        self.email = self.email.strip().lower()
        if not EMAIL_PATTERN.fullmatch(self.email):
            raise ValueError("Invalid email address")

        if (self.organization_id is None) != (self.role is None):
            raise ValueError(
                "Organization and role must be provided together"
            )
        return self


class UserMembershipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    organization_id: uuid.UUID
    organization_name: str
    organization_slug: str
    organization_is_active: bool
    role: OrganizationRole
    is_active: bool


class PlatformUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    memberships: list[UserMembershipResponse]


class CreatePlatformUserResponse(BaseModel):
    user: PlatformUserResponse
    invitation_queued: bool


class UpdatePlatformUserRequest(BaseModel):
    is_active: bool


class UpdateOrganizationAccessRequest(BaseModel):
    is_active: bool | None = None
    role: OrganizationRole | None = None

    @model_validator(mode="after")
    def validate_changes(self) -> Self:
        if self.is_active is None and self.role is None:
            raise ValueError("At least one membership change is required")
        return self


class AddOrganizationMemberRequest(BaseModel):
    user_id: uuid.UUID
    role: OrganizationRole


class EmailDispatchResponse(BaseModel):
    queued: bool