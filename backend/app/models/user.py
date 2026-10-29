import uuid
from typing import TYPE_CHECKING

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.base_entity import TimestampMixin

# SQLAlchemyBaseUserTableUUID already contains :
# users
# ─────────────────────────────
# id                UUID
# email             VARCHAR
# hashed_password   VARCHAR
# is_active         BOOLEAN
# is_superuser      BOOLEAN
# is_verified       BOOLEAN

if TYPE_CHECKING:
    from app.models.auth_session import AuthSession
    from app.models.organization_membership import OrganizationMembership

class User(
    TimestampMixin,
    SQLAlchemyBaseUserTableUUID,
    Base,
):
    __tablename__ = "users"

    default_organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "organizations.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    organization_memberships: Mapped[
        list["OrganizationMembership"]
    ] = relationship(
        back_populates="user",
        passive_deletes=True,
        lazy="raise",
    )

    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user",
        passive_deletes=True,
        lazy="raise",
    )
Index(
    "uq_users_email_lower",
    func.lower(User.email),
    unique=True,
)