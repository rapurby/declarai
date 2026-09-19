"""add bl_date column (idempotent)

Revision ID: b5e93f2a771c
Revises: a8c41d6b93e2
Create Date: 2026-09-19 12:00:00.000000

Idempotent, same pattern as the earlier migrations.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b5e93f2a771c'
down_revision: Union[str, None] = 'a8c41d6b93e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    columns = [c["name"] for c in insp.get_columns("declarations")]
    if "bl_date" not in columns:
        op.add_column("declarations", sa.Column("bl_date", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    columns = [c["name"] for c in insp.get_columns("declarations")]
    if "bl_date" in columns:
        op.drop_column("declarations", "bl_date")
