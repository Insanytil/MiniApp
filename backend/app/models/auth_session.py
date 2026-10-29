# app/models/auth_session.py

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    LargeBinary,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_entity import BaseEntity


if TYPE_CHECKING:
    from app.models.user import User


class AuthSession(BaseEntity):
    __tablename__ = "auth_sessions"

    __table_args__ = (
        UniqueConstraint(
            "token_hash",
            name="uq_auth_sessions_token_hash",
        ),
        CheckConstraint(
            "octet_length(token_hash) = 32",
            name="ck_auth_sessions_token_hash_length",
        ),
        CheckConstraint(
            "octet_length(csrf_token_hash) = 32",
            name="ck_auth_sessions_csrf_token_hash_length",
        ),
        CheckConstraint(
            "expires_at > created_at",
            name="ck_auth_sessions_expiration_after_creation",
        ),
        Index(
            "ix_auth_sessions_user_id",
            "user_id",
        ),
        Index(
            "ix_auth_sessions_expires_at",
            "expires_at",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    token_hash: Mapped[bytes] = mapped_column(
        LargeBinary(32),
        nullable=False,
    )

    csrf_token_hash: Mapped[bytes] = mapped_column(
        LargeBinary(32),
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    user: Mapped["User"] = relationship(
        back_populates="sessions",
        lazy="raise",
    )