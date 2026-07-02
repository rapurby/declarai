-- ============================================================
-- DeclarAI — Database fix script (idempotent, aman dijalankan berulang)
-- Jalankan di PostgreSQL yang dipakai backend (production/Railway & lokal):
--   psql "$DATABASE_URL" -f fix_database.sql
-- Atau copy-paste isi file ini ke query console database.
--
-- Kenapa perlu: `create_all` di startup hanya MEMBUAT TABEL BARU,
-- tidak pernah MENAMBAH KOLOM ke tabel yang sudah ada. Kolom
-- declarations.line_items harus ditambahkan manual / via alembic.
-- ============================================================

-- 1. Kolom JSON line_items di tabel declarations
--    (dipakai frontend untuk menampilkan item list)
ALTER TABLE declarations ADD COLUMN IF NOT EXISTS line_items JSON;

-- 2. Tabel declaration_item (satu baris per item barang)
--    Nama tabel HARUS "declaration_item" (singular) — sesuai model SQLAlchemy.
CREATE TABLE IF NOT EXISTS declaration_item (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    declaration_id    UUID NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
    item_no           INTEGER,
    hs_code           VARCHAR,
    description       VARCHAR,
    quantity          FLOAT,
    unit              VARCHAR,
    unit_price        FLOAT,
    total_value       FLOAT,
    country_of_origin VARCHAR,
    confidence        FLOAT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_declaration_item_declaration_id
    ON declaration_item (declaration_id);

-- 3. Verifikasi hasil (jalankan untuk cek):
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'declarations' AND column_name = 'line_items';
-- SELECT table_name  FROM information_schema.tables  WHERE table_name = 'declaration_item';
