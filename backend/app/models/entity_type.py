import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text, UniqueConstraint, Integer, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_entity import BaseEntity


class EntityType(BaseEntity):
    __tablename__ = "entity_types"
    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_entity_types_organization_id_id"),
        UniqueConstraint("organization_id", "technical_name", name="uq_entity_types_organization_technical_name"),
        Index("ix_entity_types_organization_id", "organization_id"),
        CheckConstraint("char_length(trim(name)) > 0", name="ck_entity_types_name_not_empty"),
        CheckConstraint("technical_name ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'", name="ck_entity_types_technical_name_format"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    technical_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    configuration: Mapped[dict] = mapped_column(
        JSONB, nullable=False,
        default=lambda: {"schema_version": 1, "fields": [], "relations": [], "display_profiles": [], "views": []},
        # Keep a space after the colon: text() would interpret :1 as a bind parameter.
        server_default=text("'{\"schema_version\": 1,\"fields\":[],\"relations\":[],\"display_profiles\":[],\"views\":[]}'::jsonb"),
    )
    configuration_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
