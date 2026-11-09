"""Organization scoped private files.

Revision ID: b7240d8c891a
Revises: 1e4643aa4985
"""
from alembic import op
import sqlalchemy as sa

revision = "b7240d8c891a"
down_revision = "1e4643aa4985"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "stored_files",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(127), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("object_key", sa.String(255), unique=True, nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("size_bytes > 0", name="ck_stored_files_size"),
        sa.CheckConstraint("state IN ('pending', 'ready', 'deleted')", name="ck_stored_files_state"),
    )
    op.create_index("ix_stored_files_org_created", "stored_files", ["organization_id", "created_at"])


def downgrade():
    op.drop_index("ix_stored_files_org_created", table_name="stored_files")
    op.drop_table("stored_files")
