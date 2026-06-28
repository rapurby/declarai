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

def format_for_ceisa(extracted: dict, declaration_id: str) -> dict:
    def v(field):
        item = extracted.get(field, {})
        return item.get("value") if item else None

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
        "goods": [
            {
                "sequence":         1,
                "hs_code":          v("hs_code"),
                "description":      v("description"),
                "quantity":         v("quantity"),
                "unit":             v("unit"),
                "gross_weight":     v("gross_weight"),
                "net_weight":       v("net_weight"),
                "package_quantity": v("package_quantity"),
                "package_type":     v("package_type"),
                "container_marks":  v("container_marks"),
            }
        ],
    }
