import uuid

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, Index, UniqueConstraint, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_entity import BaseEntity


class EntityRecord(BaseEntity):
    __tablename__ = 'entity_records'
    __table_args__ = (
        UniqueConstraint('organization_id', 'id', name='uq_entity_records_organization_id_id'),
        ForeignKeyConstraint(['organization_id', 'entity_type_id'], ['entity_types.organization_id', 'entity_types.id'],
                             ondelete='NO ACTION', name='fk_entity_records_scoped_type'),
        Index('ix_entity_records_organization_type_created', 'organization_id', 'entity_type_id', 'created_at'),
        CheckConstraint("jsonb_typeof(\"values\") = 'object'", name='ck_entity_records_values_object'),
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False)
    entity_type_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    values: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'), nullable=True)


class EntityRecordLink(BaseEntity):
    __tablename__ = 'entity_record_links'
    __table_args__ = (
        UniqueConstraint('organization_id', 'relation_id', 'source_record_id', 'target_record_id', name='uq_entity_record_links_edge'),
        ForeignKeyConstraint(['organization_id', 'source_record_id'], ['entity_records.organization_id', 'entity_records.id'],
                             ondelete='CASCADE', name='fk_entity_record_links_scoped_source'),
        ForeignKeyConstraint(['organization_id', 'target_record_id'], ['entity_records.organization_id', 'entity_records.id'],
                             ondelete='NO ACTION', name='fk_entity_record_links_scoped_target'),
        Index('ix_entity_record_links_source', 'organization_id', 'source_record_id', 'relation_id'),
        Index('ix_entity_record_links_target', 'organization_id', 'target_record_id', 'relation_id'),
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False)
    relation_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    source_record_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    target_record_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
