"""
Excel AJU exporter — generates the official CEISA 4.0 "Excel Upload" template
(21 sheets) from a processed Declaration, as an alternative submission
channel alongside the existing H2H API (see app/ceisa/gateway.py).

Reference: template structure confirmed from CDP-provided sample files
("EXCEL AJU.xlsx") — HEADER (107 cols), ENTITAS (16 cols), BARANG (70 cols),
DOKUMEN (7 cols), PENGANGKUT (9 cols) and KEMASAN (6 cols) are actively
populated from fields the Declaration model already extracts (invoice,
B/L, vessel/voyage, packaging). The remaining 14 sheets are written with
their header row only (kept empty, columns read verbatim from the CDP
sample) — those sections (bahan baku, cukai, jaminan, kontainer, dll)
genuinely are out of scope for a standard, non-bonded import declaration.

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
from openpyxl.styles import PatternFill, Font
from openpyxl.comments import Comment
from datetime import datetime

# Review highlighting — mirrors Excel's own built-in "Bad" / "Neutral"
# conditional-format colours so the file looks native when CDP opens it.
# Only applied to cells DeclarAI actually tries to populate; the ~90 HEADER
# columns that are blank by design stay unmarked, otherwise the whole row
# would read as an error.
FILL_BAD = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
FONT_BAD = Font(color="9C0006")
FILL_WARN = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
FONT_WARN = Font(color="9C6500")

CONF_HIGH = 0.85
CONF_LOW = 0.60

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

# Column names for the remaining sheets, read verbatim (row 1) from the
# CDP-provided "EXCEL AJU.xlsx" sample — not populated with data (out of
# scope for a standard, non-bonded import declaration), but the header row
# is written so the workbook structure matches the official template.
KONTAINER_COLUMNS = [
    "NOMOR AJU", "SERI", "NOMOR KONTINER", "KODE UKURAN KONTAINER",
    "KODE JENIS KONTAINER", "KODE TIPE KONTAINER", "NOMOR SEGEL",
]

KOMPONENBIAYA_COLUMNS = [
    "NOMOR AJU", "JENIS NILAI", "HARGA INVOICE", "PEMBAYARAN TIDAK LANGSUNG",
    "DISKON", "KOMISI PENJUALAN", "BIAYA PENGEMASAN", "BIAYA PENGEPAKAN",
    "ASSIST", "ROYALTI", "PROCEEDS", "BIAYA TRANSPORTASI",
    "BIAYA PEMUATAN", "ASURANSI", "GARANSI", "BIAYA KEPENTINGAN SENDIRI",
    "BIAYA PASCA IMPOR", "BIAYA PAJAK INTERNAL", "BUNGA", "DEVIDEN",
]

BARANGTARIF_COLUMNS = [
    "NOMOR AJU", "SERI BARANG", "KODE PUNGUTAN", "KODE TARIF", "TARIF",
    "KODE FASILITAS", "TARIF FASILITAS", "NILAI BAYAR", "NILAI FASILITAS",
    "NILAI SUDAH DILUNASI", "KODE SATUAN", "JUMLAH SATUAN",
    "FLAG BMT SEMENTARA", "KODE KOMODITI CUKAI", "KODE SUB KOMODITI CUKAI",
    "FLAG TIS", "FLAG PELEKATAN", "KODE KEMASAN", "JUMLAH KEMASAN",
]

BARANGDOKUMEN_COLUMNS = [
    "NOMOR AJU", "SERI BARANG", "SERI DOKUMEN", "SERI IZIN",
]

BARANGENTITAS_COLUMNS = [
    "NOMOR AJU", "SERI BARANG", "SERI ENTITAS",
]

BARANGSPEKKHUSUS_COLUMNS = [
    "NOMOR AJU", "SERI BARANG", "KODE", "URAIAN",
]

BARANGVD_COLUMNS = [
    "NOMOR AJU", "SERI BARANG", "KODE VD", "NILAI BARANG",
    "BIAYA TAMBAHAN", "BIAYA PENGURANG", "JATUH TEMPO",
]

BAHANBAKU_COLUMNS = [
    "NOMOR AJU", "SERI BARANG", "SERI BAHAN BAKU", "KODE ASAL BAHAN BAKU",
    "HS", "KODE BARANG", "URAIAN", "MEREK", "TIPE", "UKURAN",
    "SPESIFIKASI LAIN", "KODE SATUAN", "JUMLAH SATUAN", "KODE KEMASAN",
    "JUMLAH KEMASAN", "KODE DOKUMEN ASAL", "KODE KANTOR ASAL",
    "NOMOR DAFTAR ASAL", "TANGGAL DAFTAR ASAL", "NOMOR AJU ASAL",
    "SERI BARANG ASAL", "NETTO", "BRUTO", "VOLUME", "CIF", "CIF RUPIAH",
    "NDPBM", "HARGA PENYERAHAN", "HARGA PEROLEHAN", "NILAI JASA",
    "SERI IZIN", "VALUTA", "KODE BKC", "KODE KOMODITI BKC",
    "KODE SUB KOMODITI BKC", "FLAG TIS", "ISI PER KEMASAN",
    "JUMLAH DILEKATKAN", "JUMLAH PITA CUKAI", "HJE CUKAI", "TARIF CUKAI",
]

# NOTE: "KODE SUB KOMODITI CUKAI", "FLAG TIS", "FLAG PELEKATAN" and
# "KODE KEMASAN" genuinely repeat in the official template's row 1 for this
# sheet — kept verbatim rather than de-duplicated, per the source file.
BAHANBAKUTARIF_COLUMNS = [
    "NOMOR AJU", "SERI BARANG", "SERI BAHAN BAKU", "KODE ASAL BAHAN BAKU",
    "KODE PUNGUTAN", "KODE TARIF", "TARIF", "KODE FASILITAS",
    "TARIF FASILITAS", "NILAI BAYAR", "NILAI FASILITAS",
    "NILAI SUDAH DILUNASI", "KODE SATUAN", "JUMLAH SATUAN",
    "FLAG BMT SEMENTARA", "KODE KOMODITI CUKAI", "KODE SUB KOMODITI CUKAI",
    "FLAG TIS", "FLAG PELEKATAN", "KODE KEMASAN", "KODE SUB KOMODITI CUKAI",
    "FLAG TIS", "FLAG PELEKATAN", "KODE KEMASAN", "JUMLAH KEMASAN",
]

BAHANBAKUDOKUMEN_COLUMNS = [
    "NOMOR AJU", "SERI BARANG", "SERI BAHAN BAKU", "KODE_ASAL_BAHAN_BAKU",
    "SERI DOKUMEN", "SERI IZIN",
]

PUNGUTAN_COLUMNS = [
    "NOMOR AJU", "KODE FASILITAS TARIF", "KODE JENIS PUNGUTAN",
    "NILAI PUNGUTAN", "NPWP BILLING",
]

JAMINAN_COLUMNS = [
    "NOMOR AJU", "KODE KANTOR", "KODE JAMINAN", "NOMOR JAMINAN",
    "TANGGAL JAMINAN", "NILAI JAMINAN", "PENJAMIN", "TANGGAL JATUH TEMPO",
    "NOMOR BPJ", "TANGGAL BPJ",
]

BANKDEVISA_COLUMNS = [
    "NOMOR AJU", "SERI", "KODE", "NAMA",
]

RESPON_COLUMNS = [
    "NOMOR AJU", "KODE RESPON", "NOMOR RESPON", "TANGGAL RESPON",
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
    Fallback for declarations extracted before the insurance_value column
    existed (or where the LLM genuinely couldn't find it in the source
    document): derive it from CIF = FOB + Freight + Insurance.
    Returns None (not 0.0) when we can't compute it, so a genuinely-missing
    value isn't confused with a verified zero.
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


def _attr(obj, field, default=None):
    return getattr(obj, field, default) if not isinstance(obj, dict) else obj.get(field, default)


def _header_confidence(declaration, field):
    """
    Per-field extraction confidence as reported by the LLM, stored in
    declaration.llm_extracted["header"][field]["confidence"].
    Returns None when the field wasn't part of the extraction at all.
    """
    extracted = _attr(declaration, "llm_extracted") or {}
    if not isinstance(extracted, dict):
        return None
    header = extracted.get("header") or {}
    entry = header.get(field)
    return entry.get("confidence") if isinstance(entry, dict) else None


def _mark_cells(ws, row_idx: int, columns: list, marks: dict):
    """
    Colour the review-relevant cells of one written row.

    marks maps an Excel column name to the confidence behind it (or None
    when the value isn't LLM-extracted). A cell is flagged when it's empty
    or when confidence is below the review threshold; everything else is
    left clean so the highlights actually mean something.
    """
    for col_name, confidence in marks.items():
        try:
            col_idx = columns.index(col_name) + 1
        except ValueError:
            continue
        cell = ws.cell(row=row_idx, column=col_idx)

        if cell.value in (None, ""):
            cell.fill, cell.font = FILL_BAD, FONT_BAD
            cell.comment = Comment(
                "Kosong — tidak ditemukan di dokumen sumber. Wajib diisi manual sebelum submit.",
                "DeclarAI",
            )
        elif confidence is not None and confidence < CONF_LOW:
            cell.fill, cell.font = FILL_BAD, FONT_BAD
            cell.comment = Comment(
                f"Confidence rendah ({confidence:.0%}) — wajib diverifikasi ke dokumen asli.",
                "DeclarAI",
            )
        elif confidence is not None and confidence < CONF_HIGH:
            cell.fill, cell.font = FILL_WARN, FONT_WARN
            cell.comment = Comment(
                f"Confidence sedang ({confidence:.0%}) — sebaiknya dicek ulang.",
                "DeclarAI",
            )


def build_aju_excel(declaration, items: list, highlight: bool = True) -> Workbook:
    """
    declaration: Declaration ORM object (or any object exposing the same
                 attributes — dict-like access also supported).
    items:       list of DeclarationItem ORM objects.
    highlight:   colour empty / low-confidence cells and attach review notes.
                 True for the copy a human downloads and checks; pass False
                 for the copy attached to the H2H submission, so what CEISA
                 receives carries data only, no DeclarAI review markup.
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
    # Prefer the value extracted straight from the source document; only
    # derive it from CIF-FOB-FREIGHT when that field is genuinely empty
    # (e.g. declarations processed before this column existed).
    insurance_val = g(declaration, "insurance_value")
    if insurance_val is None:
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
    if highlight:
        # Only the columns we actually populate — the other ~90 are blank by
        # design and flagging them would drown out the real problems.
        _mark_cells(ws, 2, HEADER_COLUMNS, {
            "KODE PELABUHAN MUAT": _header_confidence(declaration, "port_of_loading"),
            "NOMOR BC11": _header_confidence(declaration, "bc11_number"),
            "ASURANSI": _header_confidence(declaration, "insurance_value"),
            "NILAI BARANG": _header_confidence(declaration, "declared_value"),
            "FREIGHT": _header_confidence(declaration, "freight_value"),
            "FOB": _header_confidence(declaration, "fob_value"),
            "CIF": _header_confidence(declaration, "cif_value"),
            "BRUTO": _header_confidence(declaration, "gross_weight"),
            "NETTO": _header_confidence(declaration, "net_weight"),
            "KODE VALUTA": _header_confidence(declaration, "currency"),
        })

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
    if highlight:
        _mark_cells(ws, 2, ENTITAS_COLUMNS, {
            "NOMOR IDENTITAS": _header_confidence(declaration, "npwp_consignee"),
            "NAMA ENTITAS": _header_confidence(declaration, "consignee"),
        })
        _mark_cells(ws, 3, ENTITAS_COLUMNS, {
            "NAMA ENTITAS": _header_confidence(declaration, "shipper"),
            "KODE NEGARA": _header_confidence(declaration, "country_of_origin"),
        })

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
        if highlight:
            # One confidence score covers the whole extracted line item, so
            # every field of that row carries the same weight.
            item_conf = g(item, "confidence")
            _mark_cells(ws, i + 1, BARANG_COLUMNS, {
                "HS": item_conf,
                "URAIAN": item_conf,
                "KODE SATUAN": item_conf,
                "JUMLAH SATUAN": item_conf,
                "HARGA SATUAN": item_conf,
                "NILAI BARANG": item_conf,
                "KODE NEGARA ASAL": item_conf,
            })

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
        if highlight:
            _mark_cells(ws, seri + 1, DOKUMEN_COLUMNS, {
                "NOMOR DOKUMEN": _header_confidence(declaration, "invoice_number"),
                "TANGGAL DOKUMEN": _header_confidence(declaration, "invoice_date"),
            })
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
        if highlight:
            _mark_cells(ws, seri + 1, DOKUMEN_COLUMNS, {
                "NOMOR DOKUMEN": _header_confidence(declaration, "bl_number"),
            })

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
        if highlight:
            _mark_cells(ws, 2, PENGANGKUT_COLUMNS, {
                "NAMA PENGANGKUT": _header_confidence(declaration, "vessel_name"),
                "NOMOR PENGANGKUT": _header_confidence(declaration, "voyage_number"),
            })

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
        if highlight:
            _mark_cells(ws, 2, KEMASAN_COLUMNS, {
                "KODE KEMASAN": _header_confidence(declaration, "package_type"),
                "JUMLAH KEMASAN": _header_confidence(declaration, "package_quantity"),
            })

    # Remaining sheets genuinely don't apply to a standard, non-bonded
    # import declaration (no bonded-zone goods, no excise, no LCL container
    # info, etc.) — write the header row only so the workbook structure
    # matches the official template, with no data rows underneath.
    for sheet_name, columns in (
        ("KONTAINER", KONTAINER_COLUMNS),
        ("KOMPONENBIAYA", KOMPONENBIAYA_COLUMNS),
        ("BARANGTARIF", BARANGTARIF_COLUMNS),
        ("BARANGDOKUMEN", BARANGDOKUMEN_COLUMNS),
        ("BARANGENTITAS", BARANGENTITAS_COLUMNS),
        ("BARANGSPEKKHUSUS", BARANGSPEKKHUSUS_COLUMNS),
        ("BARANGVD", BARANGVD_COLUMNS),
        ("BAHANBAKU", BAHANBAKU_COLUMNS),
        ("BAHANBAKUTARIF", BAHANBAKUTARIF_COLUMNS),
        ("BAHANBAKUDOKUMEN", BAHANBAKUDOKUMEN_COLUMNS),
        ("PUNGUTAN", PUNGUTAN_COLUMNS),
        ("JAMINAN", JAMINAN_COLUMNS),
        ("BANKDEVISA", BANKDEVISA_COLUMNS),
        ("RESPON", RESPON_COLUMNS),
    ):
        wb[sheet_name].append(columns)

    # VERSI sheet always carries the template version we're targeting.
    ws = wb["VERSI"]
    ws.append(["VERSI"])
    ws.append(["1.3"])

    return wb
