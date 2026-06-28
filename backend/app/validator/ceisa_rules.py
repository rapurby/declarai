import re, logging

logger = logging.getLogger(__name__)

MANDATORY_FIELDS = [
    "hs_code", "consignee", "declared_value", "currency",
    "quantity", "unit", "description", "country_of_origin"
]
CONFIDENCE_THRESHOLD = 0.75
VALID_CURRENCIES = {"USD", "EUR", "JPY", "CNY", "KRW", "SGD", "IDR", "GBP", "AUD"}
VALID_UNITS = {"PCS", "KG", "CTN", "SET", "BOX", "BAG", "M", "M2", "L", "TON", "UNIT", "PAIR", "ROLL"}

CDP_FIXED = {
    "kantor_pabean_code": "051000",
    "pelabuhan_bongkar_code": "IDJBK",
    "tempat_penimbunan_code": "CDP1",
}

def validate(extracted: dict) -> dict:
    errors, warnings, flagged = [], [], []

    # 1. Mandatory field check
    for field in MANDATORY_FIELDS:
        item = extracted.get(field, {})
        if not item or item.get("value") is None:
            errors.append(f"Mandatory field '{field}' is missing")
            flagged.append(field)
            continue
        conf = item.get("confidence", 0)
        if conf < CONFIDENCE_THRESHOLD:
            warnings.append(f"'{field}' has low confidence ({conf:.0%}) — manual review recommended")
            flagged.append(field)

    # 2. HS Code format (10-digit numeric)
    hs_item = extracted.get("hs_code", {})
    if hs_item and hs_item.get("value"):
        hs = str(hs_item["value"]).replace(".", "").replace(" ", "")
        if not re.fullmatch(r"\d{10}", hs):
            errors.append(f"Invalid HS Code format: '{hs}' (must be 10 numeric digits)")
            flagged.append("hs_code")

    # 3. Declared value must be positive
    val_item = extracted.get("declared_value", {})
    if val_item and val_item.get("value") is not None:
        try:
            val = float(val_item["value"])
            if val <= 0:
                errors.append("Declared value must be greater than 0")
                flagged.append("declared_value")
        except (ValueError, TypeError):
            errors.append("Declared value is not a valid number")
            flagged.append("declared_value")

    # 4. Currency must be recognized
    cur_item = extracted.get("currency", {})
    if cur_item and cur_item.get("value"):
        cur = str(cur_item["value"]).upper()
        if cur not in VALID_CURRENCIES:
            warnings.append(f"Currency '{cur}' is not in the standard CEISA list — verify manually")
            flagged.append("currency")

    # 5. Quantity must be positive
    qty_item = extracted.get("quantity", {})
    if qty_item and qty_item.get("value") is not None:
        try:
            qty = float(qty_item["value"])
            if qty <= 0:
                errors.append("Quantity must be greater than 0")
                flagged.append("quantity")
        except (ValueError, TypeError):
            errors.append("Quantity is not a valid number")
            flagged.append("quantity")

    # 6. Weight consistency (gross >= net)
    gw = extracted.get("gross_weight", {})
    nw = extracted.get("net_weight", {})
    if gw and nw and gw.get("value") and nw.get("value"):
        try:
            if float(gw["value"]) < float(nw["value"]):
                warnings.append("Gross weight is less than net weight — please verify")
                flagged.extend(["gross_weight", "net_weight"])
        except (ValueError, TypeError):
            pass

    # 7. FOB + Freight = CIF arithmetic check
    fob  = extracted.get("fob_value", {})
    frgt = extracted.get("freight_value", {})
    cif  = extracted.get("cif_value", {})
    if fob and frgt and cif and fob.get("value") and frgt.get("value") and cif.get("value"):
        try:
            computed_cif = float(fob["value"]) + float(frgt["value"])
            stated_cif   = float(cif["value"])
            if stated_cif > 0 and abs(computed_cif - stated_cif) / stated_cif > 0.02:
                warnings.append(
                    f"CIF arithmetic mismatch: FOB ({fob['value']}) + Freight ({frgt['value']}) "
                    f"= {computed_cif:.2f}, but stated CIF = {stated_cif:.2f}"
                )
                flagged.extend(["fob_value", "freight_value", "cif_value"])
        except (ValueError, TypeError):
            pass

    flagged = list(set(flagged))
    score = max(0, 100 - len(errors) * 10 - len(warnings) * 5)

    result = {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "flagged_fields": flagged,
        "score": score,
        "cdp_fixed_values": CDP_FIXED,
    }
    logger.info(f"✅ Validation done — valid={result['valid']}, score={score}, errors={len(errors)}")
    return result
