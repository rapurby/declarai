"""
Excel AJU exporter — generates the official CEISA 4.0 "Excel Upload" template
(21 sheets) from a processed Declaration, as an alternative submission
channel alongside the existing H2H API (see app/ceisa/gateway.py).

Reference: template structure confirmed from CDP-provided sample files
("EXCEL AJU.xlsx") — HEADER (107 cols), ENTITAS (16 cols), BARANG (70 cols),
DOKUMEN (7 cols), PENGANGKUT (9 cols) and KEMASAN (6 cols) are actively
populated from fields the Declaration model already extracts (invoice,
B/L, vessel/voyage, packaging). The remaining sheets are written with
their header row only (kept empty) — those sections (bahan baku, cukai,
jaminan, kontainer, dll) genuinely are out of scope for a standard,
non-bonded import declaration.

IMPORTANT — known limitation:
Several CEISA columns expect standardized CODES (country code, port
UN/LOCODE, unit-of-measure code, currency code, document-type code,
transport-mode code, package-type code) rather than free text.
DeclarAI's extraction currently produces human-readable text (e.g.
"China", "Tanjung Priok, Indonesia") from OCR/LLM reading of the source
document. Until we get an official code-reference table from CDP (see
Rencana_Upgrade_DeclarAI_CDP.md — "Yang masih perlu diminta ke CDP"),
those fields are written as-is (best-effort, some using public UN/EDIFACT
conventions as a starting guess) and MUST be spot-checked before real
submission. They're marked with `# NEEDS CODE MAPPING` below.
"""
from openpyxl import Workbook
from datetime import datetime

# All 20 sheets from the official template, in original order.
# Sheets not explicitly populated below are still created (header-only)
# so the workbook structure matches what CEISA's Excel-upload expects.
SHEET_ORDER = [
    "HEADER", "ENTITAS", "DOKUMEN", "PENGANGKUT", "KEMASAN", "KONTAINER",
    "KOMPONENBIAYA", "BARANG", "BARANGTARIF", "BARANGDOKUMEN",
    "BARANGENTITAS", "BARANGSPEKKHUSUS", "BARANGVD", "BAHANBAKU",
    "BAHANBAKUTARIF", "BAHANBAKUDOKUMEN", "PUNGUTAN", "JAMINAN",
    "BANKDEVISA", "VERSI", "RESPON",
]

HEADER_COLUMNS = [
    "NOMOR AJU", "KODE DOKUMEN", "KODE KANTOR", "KODE KANTOR BONGKAR",
    "KODE KANTOR PERIKSA", "KODE KANTOR TUJUAN", "KODE KANTOR EKSPOR",
    "KODE JENIS IMPOR", "KODE JENIS EKSPOR", "KODE JENIS TPB",
    "KODE JENIS PLB", "KODE JENIS PROSEDUR", "KODE TUJUAN PEMASUKAN",
    "KODE TUJUAN PENGIRIMAN", "KODE TUJUAN TPB", "KODE CARA DAGANG",
    "KODE CARA BAYAR", "KODE CARA BAYAR LAINNYA", "KODE GUDANG ASAL",
    "KODE GUDANG TUJUAN", "KODE JENIS KIRIM", "KODE JENIS PENGIRIMAN",
    "KODE KATEGORI EKSPOR", "KODE KATEGORI MASUK FTZ",
    "KODE KATEGORI KELUAR FTZ", "KODE KATEGORI BARANG FTZ", "KODE LOKASI",
    "KODE LOKASI BAYAR", "LOKASI ASAL", "LOKASI TUJUAN",
    "KODE DAERAH ASAL", "KODE GUDANG ASAL", "KODE GUDANG TUJUAN",
    "KODE NEGARA TUJUAN", "KODE TUTUP PU", "NOMOR BC11", "TANGGAL BC11",
    "NOMOR POS", "NOMOR SUB POS", "KODE PELABUHAN BONGKAR",
    "KODE PELABUHAN MUAT", "KODE PELABUHAN MUAT AKHIR",
    "KODE PELABUHAN TRANSIT", "KODE PELABUHAN TUJUAN",
    "KODE PELABUHAN EKSPOR", "KODE TPS", "TANGGAL BERANGKAT",
    "TANGGAL EKSPOR", "TANGGAL MASUK", "TANGGAL MUAT", "TANGGAL TIBA",
    "TANGGAL PERIKSA", "TEMPAT STUFFING", "TANGGAL STUFFING",
    "KODE TANDA PENGAMAN", "JUMLAH TANDA PENGAMAN", "FLAG CURAH",
    "FLAG SDA", "FLAG VD", "FLAG AP BK", "FLAG MIGAS", "KODE ASURANSI",
    "ASURANSI", "NILAI BARANG", "NILAI INCOTERM", "NILAI MAKLON",
    "ASURANSI", "FREIGHT", "FOB", "BIAYA TAMBAHAN", "BIAYA PENGURANG",
    "VD", "CIF", "HARGA_PENYERAHAN", "NDPBM", "TOTAL DANA SAWIT",
    "DASAR PENGENAAN PAJAK", "NILAI JASA", "UANG MUKA", "BRUTO", "NETTO",
    "VOLUME", "KOTA PERNYATAAN", "TANGGAL PERNYATAAN", "NAMA PERNYATAAN",
    "JABATAN PERNYATAAN", "KODE VALUTA", "KODE INCOTERM",
    "KODE JASA KENA PAJAK", "NOMOR BUKTI BAYAR", "TANGGAL BUKTI BAYAR",
    "KODE JENIS NILAI", "KODE KANTOR MUAT", "NOMOR DAFTAR",
    "TANGGAL DAFTAR", "KODE ASAL BARANG FTZ", "KODE TUJUAN PENGELUARAN",
    "PPN PAJAK", "PPNBM PAJAK", "TARIF PPN PAJAK", "TARIF PPNBM PAJAK",
    "BARANG TIDAK BERWUJUD", "KODE JENIS PENGELUARAN", "BARANG KIRIMAN",
    "FLAG KONSOL", "KODE JENIS PENGANGKUTAN", "FLAG PROPORSIONAL NETTO",
]

BARANG_COLUMNS = [
    "NOMOR AJU", "SERI BARANG", "HS", "KODE BARANG", "URAIAN", "MEREK",
    "TIPE", "UKURAN", "SPESIFIKASI LAIN", "KODE SATUAN", "JUMLAH SATUAN",
    "KODE KEMASAN", "JUMLAH KEMASAN", "KODE DOKUMEN ASAL",
    "KODE KANTOR ASAL", "NOMOR DAFTAR ASAL", "TANGGAL DAFTAR ASAL",
    "NOMOR AJU ASAL", "SERI BARANG ASAL", "NETTO", "BRUTO", "VOLUME",
    "SALDO AWAL", "SALDO AKHIR", "JUMLAH REALISASI", "CIF", "CIF RUPIAH",
    "NDPBM", "FOB", "ASURANSI", "FREIGHT", "NILAI TAMBAH", "DISKON",
    "HARGA PENYERAHAN", "HARGA PEROLEHAN", "HARGA SATUAN", "HARGA EKSPOR",
    "HARGA PATOKAN", "NILAI BARANG", "NILAI JASA", "NILAI DANA SAWIT",
    "NILAI DEVISA", "PERSENTASE IMPOR", "KODE ASAL BARANG",
    "KODE DAERAH ASAL", "KODE GUNA BARANG", "KODE JENIS NILAI",
    "JATUH TEMPO ROYALTI", "KODE KATEGORI BARANG", "KODE KONDISI BARANG",
    "KODE NEGARA ASAL", "KODE PERHITUNGAN", "PERNYATAAN LARTAS",
    "FLAG 4 TAHUN", "SERI IZIN", "TAHUN PEMBUATAN", "KAPASITAS SILINDER",
    "KODE BKC", "KODE KOMODITI BKC", "KODE SUB KOMODITI BKC", "FLAG TIS",
    "ISI PER KEMASAN", "JUMLAH DILEKATKAN", "JUMLAH PITA CUKAI",
    "HJE CUKAI", "TARIF CUKAI", "KODE JENIS EKSPOR",
    "METODE PENENTUAN NILAI", "ALASAN METODE PENENTUAN NILAI",
    "STATEMENT PERBEDAAN HARGA",
]

ENTITAS_COLUMNS = [
    "NOMOR AJU", "SERI", "KODE ENTITAS", "KODE JENIS IDENTITAS",
    "NOMOR IDENTITAS", "NAMA ENTITAS", "ALAMAT ENTITAS", "NIB ENTITAS",
    "KODE JENIS API", "KODE STATUS", "NOMOR IJIN ENTITAS",
    "TANGGAL IJIN ENTITAS", "KODE NEGARA", "NIPER ENTITAS",
    "KODE KATEGORI KONSOLIDATOR", "KODE AFILIASI",
]

# Exact column order confirmed from the CDP-provided "EXCEL AJU.xlsx" sample.
DOKUMEN_COLUMNS = [
    "NOMOR AJU", "SERI", "KODE DOKUMEN", "NOMOR DOKUMEN",
    "TANGGAL DOKUMEN", "KODE FASILITAS", "KODE IJIN",
]

PENGANGKUT_COLUMNS = [
    "NOMOR AJU", "SERI", "KODE CARA ANGKUT", "NAMA PENGANGKUT",
    "NOMOR PENGANGKUT", "KODE BENDERA", "CALL SIGN", "FLAG ANGKUT PLB",
    "CARA PENGANGKUTAN LAINNYA",
]

KEMASAN_COLUMNS = [
    "NOMOR AJU", "SERI", "KODE KEMASAN", "JUMLAH KEMASAN", "MEREK",
    "NOMOR SEGEL",
]

# UN/EDIFACT 1001 document-type codes — public standard, used here as a
# best-effort starting point until CDP confirms CEISA's own KODE DOKUMEN
# reference table (see Rencana_Upgrade_DeclarAI_CDP.md).
DOKUMEN_TYPE_CODE = {
    "invoice": "380",       # Commercial invoice
    "bill_of_lading": "705",  # Bill of lading
}

# CDP's fixed operational values (same ones already used in the H2H payload
# formatter — app/ceisa/formatter.py — kept in sync here for consistency).
CDP_FIXED_HEADER = {
    "KODE KANTOR": "051000",
    "KODE PELABUHAN BONGKAR": "IDJBK",   # NEEDS CODE MAPPING confirmation
}


def _compute_insurance(fob, freight, cif):
    """
    Declaration has no dedicated insurance column, but it's fully
    derivable from the three values customs already requires: CIF = FOB +
    Freight + Insurance. Returns None (not 0.0) when we can't compute it,
    so a genuinely-missing value isn't confused with a verified zero.
    """
    if fob is None or freight is None or cif is None:
        return None
    return round(cif - fob - freight, 2)


def _aju_placeholder(declaration_id: str) -> str:
    """
    NOMOR AJU is normally assigned by CEISA on submission, not by us.
    We write a readable placeholder so the file is inspectable before
    a real AJU number exists; replace with the real one once CEISA
    assigns it (e.g. after a successful portal/H2H submission).
    """
    return f"DRAFT-{str(declaration_id)[:8].upper()}"


def build_aju_excel(declaration, items: list) -> Workbook:
    """
    declaration: Declaration ORM object (or any object exposing the same
                 attributes — dict-like access also supported).
    items:       list of DeclarationItem ORM objects.
    Returns an openpyxl Workbook ready to be saved / streamed.
    """
    wb = Workbook()
    wb.remove(wb.active)  # drop the default blank sheet

    # Create every sheet up front, in the official template order, so tab
    # order matches exactly what CEISA's Excel-upload parser expects (some
    # parsers read by position as well as by name).
    for name in SHEET_ORDER:
        wb.create_sheet(name)

    def g(obj, field, default=None):
        return getattr(obj, field, default) if not isinstance(obj, dict) else obj.get(field, default)

    aju = _aju_placeholder(g(declaration, "id", "unknown"))

    fob_val = g(declaration, "fob_value")
    freight_val = g(declaration, "freight_value")
    cif_val = g(declaration, "cif_value")
    insurance_val = _compute_insurance(fob_val, freight_val, cif_val)

    # ---- HEADER ----
    ws = wb["HEADER"]
    ws.append(HEADER_COLUMNS)
    row = {col: None for col in HEADER_COLUMNS}
    row.update({
        "NOMOR AJU": aju,
        "KODE DOKUMEN": "20",  # PIB — BC 2.0
        "KODE KANTOR": CDP_FIXED_HEADER["KODE KANTOR"],
        "KODE PELABUHAN BONGKAR": CDP_FIXED_HEADER["KODE PELABUHAN BONGKAR"],
        "KODE PELABUHAN MUAT": g(declaration, "port_of_loading"),        # NEEDS CODE MAPPING (currently free text)
        "KODE PELABUHAN TRANSIT": g(declaration, "port_of_transit"),     # NEEDS CODE MAPPING
        "NOMOR BC11": g(declaration, "bc11_number"),
        "ASURANSI": insurance_val,  # derived: CIF - FOB - FREIGHT (was hardcoded 0.0)
        "NILAI BARANG": g(declaration, "declared_value"),
        "FREIGHT": freight_val,
        "FOB": fob_val,
        "CIF": cif_val,
        "NDPBM": g(declaration, "exchange_rate"),
        "BRUTO": g(declaration, "gross_weight"),
        "NETTO": g(declaration, "net_weight"),
        "KODE VALUTA": g(declaration, "currency"),                       # NEEDS CODE MAPPING (ISO 4217 expected)
        "PACKAGE_TYPE_REF": None,
    })
    ws.append([row.get(col) for col in HEADER_COLUMNS])

    # ---- ENTITAS (importer / consignee) ----
    ws = wb["ENTITAS"]
    ws.append(ENTITAS_COLUMNS)
    erow = {col: None for col in ENTITAS_COLUMNS}
    erow.update({
        "NOMOR AJU": aju,
        "SERI": 1,
        "KODE ENTITAS": "1",  # 1 = Importir (konvensi CEISA)
        "NAMA ENTITAS": g(declaration, "consignee"),
        "NOMOR IDENTITAS": g(declaration, "npwp_consignee"),
    })
    ws.append([erow.get(col) for col in ENTITAS_COLUMNS])
    erow2 = {col: None for col in ENTITAS_COLUMNS}
    erow2.update({
        "NOMOR AJU": aju,
        "SERI": 2,
        "KODE ENTITAS": "9",  # 9 = Penjual/Shipper (konvensi CEISA)
        "NAMA ENTITAS": g(declaration, "shipper"),
        "KODE NEGARA": g(declaration, "country_of_origin"),              # NEEDS CODE MAPPING (ISO 3166 expected)
    })
    ws.append([erow2.get(col) for col in ENTITAS_COLUMNS])

    # ---- BARANG (one row per line item) ----
    ws = wb["BARANG"]
    ws.append(BARANG_COLUMNS)
    for i, item in enumerate(items or [], start=1):
        brow = {col: None for col in BARANG_COLUMNS}
        brow.update({
            "NOMOR AJU": aju,
            "SERI BARANG": g(item, "item_no", i),
            "HS": g(item, "hs_code"),
            "URAIAN": g(item, "description"),
            "KODE SATUAN": g(item, "unit"),                               # NEEDS CODE MAPPING
            "JUMLAH SATUAN": g(item, "quantity"),
            "HARGA SATUAN": g(item, "unit_price"),
            "NILAI BARANG": g(item, "total_value"),
            "FOB": g(item, "total_value"),
            "KODE NEGARA ASAL": g(item, "country_of_origin"),             # NEEDS CODE MAPPING
        })
        ws.append([brow.get(col) for col in BARANG_COLUMNS])

    # ---- DOKUMEN (invoice + B/L references) ----
    ws = wb["DOKUMEN"]
    ws.append(DOKUMEN_COLUMNS)
    seri = 0
    invoice_number = g(declaration, "invoice_number")
    if invoice_number:
        seri += 1
        drow = {col: None for col in DOKUMEN_COLUMNS}
        drow.update({
            "NOMOR AJU": aju,
            "SERI": seri,
            "KODE DOKUMEN": DOKUMEN_TYPE_CODE["invoice"],  # NEEDS CODE MAPPING (UN/EDIFACT guess)
            "NOMOR DOKUMEN": invoice_number,
            "TANGGAL DOKUMEN": g(declaration, "invoice_date"),
        })
        ws.append([drow.get(col) for col in DOKUMEN_COLUMNS])
    bl_number = g(declaration, "bl_number")
    if bl_number:
        seri += 1
        drow = {col: None for col in DOKUMEN_COLUMNS}
        drow.update({
            "NOMOR AJU": aju,
            "SERI": seri,
            "KODE DOKUMEN": DOKUMEN_TYPE_CODE["bill_of_lading"],  # NEEDS CODE MAPPING (UN/EDIFACT guess)
            "NOMOR DOKUMEN": bl_number,
        })
        ws.append([drow.get(col) for col in DOKUMEN_COLUMNS])

    # ---- PENGANGKUT (vessel / voyage) ----
    ws = wb["PENGANGKUT"]
    ws.append(PENGANGKUT_COLUMNS)
    vessel_name = g(declaration, "vessel_name")
    if vessel_name:
        prow = {col: None for col in PENGANGKUT_COLUMNS}
        prow.update({
            "NOMOR AJU": aju,
            "SERI": 1,
            "KODE CARA ANGKUT": "1",  # NEEDS CODE MAPPING — best-effort guess: 1 = laut (sea)
            "NAMA PENGANGKUT": vessel_name,
            "NOMOR PENGANGKUT": g(declaration, "voyage_number"),
        })
        ws.append([prow.get(col) for col in PENGANGKUT_COLUMNS])

    # ---- KEMASAN (packages) ----
    ws = wb["KEMASAN"]
    ws.append(KEMASAN_COLUMNS)
    package_quantity = g(declaration, "package_quantity")
    if package_quantity:
        krow = {col: None for col in KEMASAN_COLUMNS}
        krow.update({
            "NOMOR AJU": aju,
            "SERI": 1,
            "KODE KEMASAN": g(declaration, "package_type"),  # NEEDS CODE MAPPING (currently free text, e.g. "CARTONS")
            "JUMLAH KEMASAN": package_quantity,
        })
        ws.append([krow.get(col) for col in KEMASAN_COLUMNS])

    # Remaining sheets (KONTAINER, KOMPONENBIAYA, etc.) were already created
    # above and are left header-row-only — that matches what an out-of-the-
    # box PIB submission looks like when those sections genuinely don't
    # apply (no bonded-zone goods, no excise, no LCL container info, etc.).

    # VERSI sheet always carries the template version we're targeting.
    ws = wb["VERSI"]
    ws.append(["VERSI"])
    ws.append(["1.3"])

    return wb
