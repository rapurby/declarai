"""add line_items column (idempotent)

Revision ID: e26bc1684c69
Revises:
Create Date: 2026-06-30 17:27:02.979857

Idempotent: aman dijalankan berulang. Cek dulu apakah kolom/tabel
sudah ada sebelum membuat — kolom line_items pernah ditambahkan manual
di production, sehingga ADD COLUMN tanpa cek membuat startup crash
(healthcheck failure di Railway).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e26bc1684c69'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1. Kolom declarations.line_items — hanya jika belum ada
    columns = [c["name"] for c in insp.get_columns("declarations")]
    if "line_items" not in columns:
        op.add_column("declarations", sa.Column("line_items", sa.JSON(), nullable=True))

    # 2. Tabel declaration_item — hanya jika belum ada
    #    (init_db/create_all juga membuatnya, tapi migration jalan lebih
    #    dulu di CMD Dockerfile, jadi lebih aman dibuat di sini juga)
    if not insp.has_table("declaration_item"):
        op.create_table(
            "declaration_item",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "declaration_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("declarations.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("item_no", sa.Integer()),
            sa.Column("hs_code", sa.String()),
            sa.Column("description", sa.String()),
            sa.Column("quantity", sa.Float()),
            sa.Column("unit", sa.String()),
            sa.Column("unit_price", sa.Float()),
            sa.Column("total_value", sa.Float()),
            sa.Column("country_of_origin", sa.String()),
            sa.Column("confidence", sa.Float()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("declaration_item"):
        op.drop_table("declaration_item")

    columns = [c["name"] for c in insp.get_columns("declarations")]
    if "line_items" in columns:
        op.drop_column("declarations", "line_items")
