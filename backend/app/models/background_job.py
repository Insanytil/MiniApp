import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum as SqlEnum
from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_entity import BaseEntity


class BackgroundJobType(StrEnum):
    ACCOUNT_VERIFICATION_EMAIL = "account_verification_email"
    PASSWORD_RESET_EMAIL = "password_reset_email"


class BackgroundJobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BackgroundJob(BaseEntity):
    __tablename__ = "background_jobs"
    __table_args__ = (
        Index("ix_background_jobs_organization_status", "organization_id", "status"),
        Index("ix_background_jobs_created_at", "created_at"),
        Index("ix_background_jobs_batch_id", "batch_id"),
    )

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
    )
    subject_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    triggered_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    recipient_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    celery_task_id: Mapped[str] = mapped_column(String(36), nullable=False)
    type: Mapped[BackgroundJobType] = mapped_column(
        SqlEnum(
            BackgroundJobType,
            name="background_job_type",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=lambda enum_class: [member.value for member in enum_class],
        ),
        nullable=False,
    )
    status: Mapped[BackgroundJobStatus] = mapped_column(
        SqlEnum(
            BackgroundJobStatus,
            name="background_job_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=lambda enum_class: [member.value for member in enum_class],
        ),
        nullable=False,
        default=BackgroundJobStatus.QUEUED,
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )