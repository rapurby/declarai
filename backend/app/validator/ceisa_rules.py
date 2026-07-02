import re
import logging

logger = logging.getLogger(__name__)

# Header-level mandatory fields (per-document).
# hs_code / quantity / unit / description pindah ke ITEM_MANDATORY karena
# sekarang tiap dokumen bisa punya banyak item (tabel declaration_item).
HEADER_MANDATORY = [
    "consignee", "declared_value", "currency", "country_of_origin",
]

# Per-line-item mandatory fields.
ITEM_MANDATORY = ["hs_code", "description", "quantity", "unit"]

CONFIDENCE_THRESHOLD = 0.75
ARITHMETIC_TOLERANCE = 0.02  # 2%
VALID_CURRENCIES = {"USD", "EUR", "JPY", "CNY", "KRW", "SGD", "IDR", "GBP", "AUD"}
VALID_UNITS = {"PCS", "KG", "CTN", "SET", "BOX", "BAG", "M", "M2", "L", "TON", "UNIT", "PAIR", "ROLL"}

CDP_FIXED = {
    "kantor_pabean_code": "051000",
    "pelabuhan_bongkar_code": "IDJBK",
    "tempat_penimbunan_code": "CDP1",
}


def _num(v):
    """Parse a number that may contain commas/currency text. None if invalid."""
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "").replace("USD", "").replace("IDR", "").strip())
    except (ValueError, TypeError):
        return None


def _valid_hs(hs) -> bool:
    hs = str(hs).replace(".", "").replace(" ", "")
    return bool(re.fullmatch(r"\d{10}", hs))


def validate(extracted: dict, line_items: list = None) -> dict:
    """
    Validate extracted customs data against CEISA rules.

    Accepts either:
      - validate(header_dict, line_items_list)  — new style
      - validate(full_raw_dict)                 — raw LLM output
        {"header": {...}, "line_items": [...], "insight": {...}}
        (backward compatible: header & items diambil otomatis)

    header values follow {"field": {"value": ..., "confidence": ...}} format.
    line_items adalah list of plain dict:
        {"no", "hs_code", "description", "quantity", "unit",
         "unit_price", "total_value", "country_of_origin", "confidence"}
    """
    extracted = extracted or {}

    # Unwrap raw LLM structure if given the full dict
    if isinstance(extracted.get("header"), dict):
        if line_items is None:
            line_items = extracted.get("line_items") or []
        extracted = extracted["header"]
    line_items = line_items or []

    errors, warnings, flagged = [], [], []

    # ==========================================================
    # HEADER CHECKS
    # ==========================================================

    # 1. Mandatory header fields
    for field in HEADER_MANDATORY:
        item = extracted.get(field, {})
        if not item or item.get("value") is None:
            errors.append(f"Mandatory field '{field}' is missing")
            flagged.append(field)
            continue
        conf = item.get("confidence", 0)
        if conf < CONFIDENCE_THRESHOLD:
            warnings.append(f"'{field}' has low confidence ({conf:.0%}) — manual review recommended")
            flagged.append(field)

    # 2. Declared value must be positive
    val_item = extracted.get("declared_value", {})
    if val_item and val_item.get("value") is not None:
        val = _num(val_item["value"])
        if val is None:
            errors.append("Declared value is not a valid number")
            flagged.append("declared_value")
        elif val <= 0:
            errors.append("Declared value must be greater than 0")
            flagged.append("declared_value")

    # 3. Currency must be recognized
    cur_item = extracted.get("currency", {})
    if cur_item and cur_item.get("value"):
        cur = str(cur_item["value"]).upper()
        if cur not in VALID_CURRENCIES:
            warnings.append(f"Currency '{cur}' is not in the standard CEISA list — verify manually")
            flagged.append("currency")

    # 4. Weight consistency (gross >= net)
    gw = extracted.get("gross_weight", {})
    nw = extracted.get("net_weight", {})
    if gw and nw and gw.get("value") and nw.get("value"):
        g, n = _num(gw["value"]), _num(nw["value"])
        if g is not None and n is not None and g < n:
            warnings.append("Gross weight is less than net weight — please verify")
            flagged.extend(["gross_weight", "net_weight"])

    # 5. FOB + Freight = CIF arithmetic check
    fob  = extracted.get("fob_value", {})
    frgt = extracted.get("freight_value", {})
    cif  = extracted.get("cif_value", {})
    if fob and frgt and cif and fob.get("value") and frgt.get("value") and cif.get("value"):
        f_, r_, c_ = _num(fob["value"]), _num(frgt["value"]), _num(cif["value"])
        if None not in (f_, r_, c_) and c_ > 0:
            computed = f_ + r_
            if abs(computed - c_) / c_ > ARITHMETIC_TOLERANCE:
                warnings.append(
                    f"CIF arithmetic mismatch: FOB ({f_}) + Freight ({r_}) "
                    f"= {computed:.2f}, but stated CIF = {c_:.2f}"
                )
                flagged.extend(["fob_value", "freight_value", "cif_value"])

    # ==========================================================
    # LINE ITEM CHECKS
    # ==========================================================

    if not line_items:
        errors.append("No line items detected — at least one item with HS code is required")
        flagged.append("line_items")

    items_total = 0.0
    has_items_total = False

    for idx, item in enumerate(line_items):
        no = item.get("no") or item.get("item_no") or (idx + 1)
        tag = f"Item {no}"

        # 6. Mandatory per-item fields
        for f in ITEM_MANDATORY:
            if item.get(f) in (None, ""):
                errors.append(f"{tag}: mandatory field '{f}' is missing")
                flagged.append("line_items")

        # 7. HS Code format (10-digit numeric)
        if item.get("hs_code") and not _valid_hs(item["hs_code"]):
            errors.append(f"{tag}: invalid HS Code '{item['hs_code']}' (must be 10 numeric digits)")
            flagged.append("line_items")

        # 8. Quantity must be positive
        qty = _num(item.get("quantity"))
        if item.get("quantity") is not None:
            if qty is None:
                errors.append(f"{tag}: quantity is not a valid number")
                flagged.append("line_items")
            elif qty <= 0:
                errors.append(f"{tag}: quantity must be greater than 0")
                flagged.append("line_items")

        # 9. Unit recognized
        if item.get("unit") and str(item["unit"]).upper() not in VALID_UNITS:
            warnings.append(f"{tag}: unit '{item['unit']}' is not in the standard list — verify manually")
            flagged.append("line_items")

        # 10. Per-item arithmetic: qty x unit_price = total_value
        price = _num(item.get("unit_price"))
        total = _num(item.get("total_value"))
        if qty and price and total and total > 0:
            computed = qty * price
            if abs(computed - total) / total > ARITHMETIC_TOLERANCE:
                warnings.append(
                    f"{tag}: arithmetic mismatch — qty ({qty}) x unit price ({price}) "
                    f"= {computed:.2f}, but total value = {total:.2f}"
                )
                flagged.append("line_items")

        # 11. Low extraction confidence per item
        conf = item.get("confidence")
        if conf is not None and conf < CONFIDENCE_THRESHOLD:
            warnings.append(f"{tag}: low extraction confidence ({conf:.0%}) — manual review recommended")
            flagged.append("line_items")

        if total is not None:
            items_total += total
            has_items_total = True

    # 12. Sum of item totals vs declared value
    declared = _num((extracted.get("declared_value") or {}).get("value"))
    if has_items_total and declared and declared > 0:
        if abs(items_total - declared) / declared > ARITHMETIC_TOLERANCE:
            warnings.append(
                f"Sum of item totals ({items_total:.2f}) does not match "
                f"declared value ({declared:.2f}) — please verify"
            )
            flagged.extend(["declared_value", "line_items"])

    flagged = list(set(flagged))
    score = max(0, 100 - len(errors) * 10 - len(warnings) * 5)

    result = {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "flagged_fields": flagged,
        "score": score,
        "item_count": len(line_items),
        "cdp_fixed_values": CDP_FIXED,
    }
    logger.info(f"✅ Validation done — valid={result['valid']}, score={score}, "
                f"errors={len(errors)}, items={len(line_items)}")
    return result
