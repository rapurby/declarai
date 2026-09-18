"""add shipper_identity column (idempotent)

Revision ID: a8c41d6b93e2
Revises: f3a7c9de21b0
Create Date: 2026-09-19 00:00:00.000000

Idempotent, same pattern as the earlier migrations — check before adding so
re-running (or running after the column was created manually in production)
doesn't crash startup.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a8c41d6b93e2'
down_revision: Union[str, None] = 'f3a7c9de21b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    columns = [c["name"] for c in insp.get_columns("declarations")]
    if "shipper_identity" not in columns:
        op.add_column("declarations", sa.Column("shipper_identity", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    columns = [c["name"] for c in insp.get_columns("declarations")]
    if "shipper_identity" in columns:
        op.drop_column("declarations", "shipper_identity")
