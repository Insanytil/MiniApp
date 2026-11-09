"""Add organization specific user names.

Revision ID: c92f15a7b301
Revises: b7240d8c891a
"""
from alembic import op
import sqlalchemy as sa

revision = "c92f15a7b301"
down_revision = "b7240d8c891a"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organization_memberships", sa.Column("first_name", sa.String(100), nullable=False, server_default=""))
    op.add_column("organization_memberships", sa.Column("last_name", sa.String(100), nullable=False, server_default=""))


def downgrade():
    op.drop_column("organization_memberships", "last_name")
    op.drop_column("organization_memberships", "first_name")
