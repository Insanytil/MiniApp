import uuid
from sqlalchemy import BigInteger, Boolean, CheckConstraint, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base_entity import BaseEntity


class StoredFile(BaseEntity):
    __tablename__ = "stored_files"
    __table_args__ = (
        Index("ix_stored_files_org_created", "organization_id", "created_at"),
        CheckConstraint("size_bytes > 0", name="ck_stored_files_size"),
        CheckConstraint("state IN ('pending', 'ready', 'deleted')", name="ck_stored_files_state"),
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    is_selectable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(127))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    object_key: Mapped[str] = mapped_column(String(255), unique=True)
    state: Mapped[str] = mapped_column(String(16), default="pending")
