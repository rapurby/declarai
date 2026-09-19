"""add doc_seq column (idempotent) — human-readable "DCLR-0001" codes

Revision ID: a7c4e8f1b2d3
Revises: f3a7c9de21b0
Create Date: 2026-09-18 00:00:00.000000

Idempotent, same pattern as the other migrations in this folder: check
before creating so re-running this on a database that already has the
column/sequence is a no-op instead of a crash.

What this does:
1. Creates a real Postgres sequence `declaration_doc_seq`.
2. Adds `doc_seq` (integer, unique) to `declarations`, defaulting to
   `nextval('declaration_doc_seq')` — so every *new* row gets its number
   atomically at INSERT time, no application-level race.
3. Backfills every existing row's `doc_seq` in upload order
   (`created_at`, tie-broken by `id` since a few rows can share the exact
   same timestamp) so today's already-uploaded declarations get
   DCLR-0001, DCLR-0002, ... in the order they actually came in.
4. Advances the sequence past the highest backfilled number so the next
   new upload continues counting up correctly instead of colliding.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a7c4e8f1b2d3'
down_revision: Union[str, None] = 'f3a7c9de21b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    columns = [c["name"] for c in insp.get_columns("declarations")]

    if "doc_seq" not in columns:
        op.execute("CREATE SEQUENCE IF NOT EXISTS declaration_doc_seq")
        op.add_column(
            "declarations",
            sa.Column(
                "doc_seq",
                sa.Integer(),
                server_default=sa.text("nextval('declaration_doc_seq')"),
                nullable=True,
            ),
        )
        op.create_index(
            "ix_declarations_doc_seq", "declarations", ["doc_seq"], unique=True
        )
        # Tie the sequence to the column so DROP COLUMN cleans it up too.
        op.execute(
            "ALTER SEQUENCE declaration_doc_seq OWNED BY declarations.doc_seq"
        )

    # Backfill rows that don't have a number yet (fresh column add, or a
    # partial run that got interrupted) in the order they were uploaded.
    op.execute("""
        WITH ordered AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
            FROM declarations
            WHERE doc_seq IS NULL
        )
        UPDATE declarations d
        SET doc_seq = (
            SELECT COALESCE((SELECT MAX(doc_seq) FROM declarations), 0)
        ) + ordered.rn
        FROM ordered
        WHERE d.id = ordered.id
    """)

    # Move the sequence past whatever we just backfilled so the next
    # real upload doesn't collide with an existing doc_seq.
    op.execute("""
        SELECT setval(
            'declaration_doc_seq',
            COALESCE((SELECT MAX(doc_seq) FROM declarations), 0) + 1,
            false
        )
    """)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    columns = [c["name"] for c in insp.get_columns("declarations")]
    if "doc_seq" in columns:
        op.drop_index("ix_declarations_doc_seq", table_name="declarations")
        op.drop_column("declarations", "doc_seq")
    op.execute("DROP SEQUENCE IF EXISTS declaration_doc_seq")
