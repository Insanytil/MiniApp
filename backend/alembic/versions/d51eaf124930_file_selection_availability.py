"""File library selection availability.

Revision ID: d51eaf124930
Revises: c92f15a7b301
"""
from alembic import op
import sqlalchemy as sa

revision = "d51eaf124930"
down_revision = "c92f15a7b301"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("stored_files", sa.Column("is_selectable", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade():
    op.drop_column("stored_files", "is_selectable")
