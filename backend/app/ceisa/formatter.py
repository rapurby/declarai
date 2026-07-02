from datetime import datetime

CDP_FIXED = {
    "kantor_pabean":        "KPPBC Cikarang",
    "kantor_pabean_code":   "051000",
    "pelabuhan_bongkar":    "Cikarang Dry Port",
    "pelabuhan_bongkar_code": "IDJBK",
    "tempat_penimbunan":    "Cikarang Dry Port",
    "tempat_penimbunan_code": "CDP1",
    "cara_pengangkutan":    "Laut",
    "cara_pengangkutan_code": "1",
    "ppjk_name":            "PT Cikarang Dry Port",
}

def format_for_ceisa(extracted: dict, declaration_id: str, line_items: list = None) -> dict:
    """
    Build the CEISA Host-to-Host payload.

    `extracted` boleh berupa header flat ({"consignee": {"value":...}, ...})
    ATAU raw LLM output nested ({"header": {...}, "line_items": [...]}) —
    keduanya di-handle supaya caller lama tetap jalan.
    """
    extracted = extracted or {}
    if isinstance(extracted.get("header"), dict):
        if line_items is None:
            line_items = extracted.get("line_items") or []
        extracted = extracted["header"]
    line_items = line_items or []

    def v(field):
        item = extracted.get(field, {})
        return item.get("value") if item else None

    # Goods: satu entri per line item (multi-item support).
    # Fallback ke field legacy header kalau dokumen lama belum punya line_items.
    if line_items:
        goods = [
            {
                "sequence":          item.get("no") or item.get("item_no") or (i + 1),
                "hs_code":           item.get("hs_code"),
                "description":       item.get("description"),
                "quantity":          item.get("quantity"),
                "unit":              item.get("unit"),
                "unit_price":        item.get("unit_price"),
                "total_value":       item.get("total_value"),
                "country_of_origin": item.get("country_of_origin"),
            }
            for i, item in enumerate(line_items)
        ]
    else:
        goods = [
            {
                "sequence":    1,
                "hs_code":     v("hs_code"),
                "description": v("description"),
                "quantity":    v("quantity"),
                "unit":        v("unit"),
            }
        ]

    return {
        "header": {
            "declaration_id":   str(declaration_id),
            "declaration_type": "PIB",
            "bc_type":          "BC 2.0",
            "submission_date":  datetime.utcnow().isoformat() + "Z",
            **CDP_FIXED,
        },
        "importer": {
            "consignee_name": v("consignee"),
            "npwp":           v("npwp_consignee"),
        },
        "exporter": {
            "shipper_name":     v("shipper"),
            "country_of_origin": v("country_of_origin"),
            "port_of_loading":  v("port_of_loading"),
        },
        "transport": {
            "bl_number":        v("bl_number"),
            "vessel_name":      v("vessel_name"),
            "voyage_number":    v("voyage_number"),
            "port_of_discharge": v("port_of_discharge"),
            "port_of_transit":  v("port_of_transit"),
            "bc11_number":      v("bc11_number"),
        },
        "invoice": {
            "invoice_number":  v("invoice_number"),
            "invoice_date":    v("invoice_date"),
            "currency":        v("currency"),
            "fob_value":       v("fob_value"),
            "freight_value":   v("freight_value"),
            "cif_value":       v("cif_value"),
            "cif_idr":         v("cif_idr"),
            "exchange_rate":   v("exchange_rate"),
            "declared_value":  v("declared_value"),
        },
        "packaging": {
            "gross_weight":     v("gross_weight"),
            "net_weight":       v("net_weight"),
            "package_quantity": v("package_quantity"),
            "package_type":     v("package_type"),
            "container_marks":  v("container_marks"),
        },
        "goods": goods,
    }
