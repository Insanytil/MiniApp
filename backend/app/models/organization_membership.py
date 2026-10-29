import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Enum as SqlEnum,
    ForeignKey,
    Index,
    UniqueConstraint,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_entity import BaseEntity
from app.models.organization_role import OrganizationRole


if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class OrganizationMembership(BaseEntity):
    __tablename__ = "organization_memberships"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "organization_id",
            name="uq_organization_memberships_user_organization",
        ),
        Index(
            "ix_organization_memberships_organization_id",
            "organization_id",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(
            "organizations.id",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    role: Mapped[OrganizationRole] = mapped_column(
        SqlEnum(
            OrganizationRole,
            name="organization_role",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=lambda enum_class: [
                member.value for member in enum_class
            ],
        ),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
    )

    user: Mapped["User"] = relationship(
        back_populates="organization_memberships",
        lazy="raise",
    )

    organization: Mapped["Organization"] = relationship(
        back_populates="memberships",
        lazy="raise",
    )