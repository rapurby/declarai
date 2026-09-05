"""add insurance_value column (idempotent)

Revision ID: f3a7c9de21b0
Revises: e26bc1684c69
Create Date: 2026-09-06 00:00:00.000000

Idempotent: aman dijalankan berulang, sama seperti migration line_items —
cek dulu apakah kolom sudah ada sebelum ADD COLUMN, supaya tidak crash
kalau kolom pernah ditambahkan manual di production.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f3a7c9de21b0'
down_revision: Union[str, None] = 'e26bc1684c69'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    columns = [c["name"] for c in insp.get_columns("declarations")]
    if "insurance_value" not in columns:
        op.add_column("declarations", sa.Column("insurance_value", sa.Float(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    columns = [c["name"] for c in insp.get_columns("declarations")]
    if "insurance_value" in columns:
        op.drop_column("declarations", "insurance_value")
