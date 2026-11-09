"""Authorized organization context shared with application services."""
from dataclasses import dataclass

from app.models.organization import Organization
from app.models.organization_role import OrganizationRole
from app.models.user import User


@dataclass(frozen=True, slots=True)
class OrganizationScope:
    organization: Organization
    user: User
    role: OrganizationRole | None


