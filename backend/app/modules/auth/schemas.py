import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.organization_role import OrganizationRole
class CurrentOrganizationResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    role: OrganizationRole


class LoginRequest(BaseModel):
    email: str = Field(
        min_length=3,
        max_length=320,
    )
    password: str = Field(
        min_length=1,
        max_length=1024,
    )


class CurrentUserResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
    )

    id: uuid.UUID
    email: str
    is_superuser: bool
    is_verified: bool
    default_organization_id: uuid.UUID | None
    organizations: list[CurrentOrganizationResponse]


class UpdateCurrentUserPreferencesRequest(BaseModel):
    default_organization_id: uuid.UUID | None


class InvitationResponse(BaseModel):
    email: str
    expires_at: datetime


class AcceptInvitationRequest(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    password: str = Field(min_length=1, max_length=1024)


class PasswordResetResponse(BaseModel):
    email: str
    expires_at: datetime


class AcceptPasswordResetRequest(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    password: str = Field(min_length=1, max_length=1024)