import json, logging
from app.llm.client import call_claude
from app.core.config import settings

logger = logging.getLogger(__name__)

INSIGHT_SYSTEM = """You are a customs document quality analyst. Analyze extracted customs data and produce a concise insight report.
Always respond with valid JSON only — no preamble, no markdown fences."""

INSIGHT_PROMPT = """Analyze this customs declaration extraction result and produce an insight report.

DOCUMENT TYPE: {document_type}
EXTRACTED FIELDS (field: {{value, confidence}}):
{fields_json}

VALIDATION RESULT:
{validation_json}

Return a JSON object with this exact structure:
{{
  "document_type": "invoice|packing_list|bill_of_lading|unknown",
  "overall_confidence": 0.0,
  "confidence_level": "high|medium|low",
  "low_confidence_fields": [
    {{"field": "field_name", "confidence": 0.0, "reason": "why confidence is low"}}
  ],
  "anomalies": [
    {{"type": "arithmetic|consistency|format|missing", "description": "what was detected", "severity": "error|warning"}}
  ],
  "cross_doc_warnings": [],
  "suggested_action": "auto_approve|needs_review|cannot_submit",
  "suggested_action_reason": "brief explanation"
}}

Check for:
1. Arithmetic: fob_value + freight_value should equal cif_value (within 1% tolerance)
2. Arithmetic: quantity × unit_price ≈ declared_value if unit price visible
3. Weight: gross_weight must be >= net_weight
4. Low confidence fields (below 0.75)
5. Missing mandatory fields: hs_code, consignee, declared_value, currency, quantity, unit, description, country_of_origin
6. HS code format: must be 10 numeric digits
7. Currency must be valid: USD, EUR, JPY, CNY, KRW, SGD, IDR, GBP, AUD"""

MOCK_INSIGHT = {
    "document_type": "invoice",
    "overall_confidence": 0.91,
    "confidence_level": "high",
    "low_confidence_fields": [
        {"field": "net_weight", "confidence": 0.87, "reason": "Weight values sometimes misread by OCR"},
        {"field": "bc11_number", "confidence": 0.0, "reason": "Field not found in document"}
    ],
    "anomalies": [],
    "cross_doc_warnings": [],
    "suggested_action": "auto_approve",
    "suggested_action_reason": "All mandatory fields extracted with high confidence. No arithmetic anomalies detected."
}

def generate_insight(extracted: dict, validation: dict) -> dict:
    if settings.APP_ENV == "development" or settings.ANTHROPIC_API_KEY.startswith("sk-ant-placeholder"):
        logger.info("🔧 Using mock insight (development mode)")
        return MOCK_INSIGHT

    doc_type = (extracted.get("document_type") or {}).get("value", "unknown")
    fields_json = json.dumps(extracted, indent=2)
    validation_json = json.dumps(validation, indent=2)

    prompt = INSIGHT_PROMPT.format(
        document_type=doc_type,
        fields_json=fields_json,
        validation_json=validation_json,
    )

    logger.info("🤖 Calling Claude API for document insight...")
    response = call_claude(prompt, INSIGHT_SYSTEM, max_tokens=1500)

    try:
        clean = response.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        result = json.loads(clean)
        logger.info(f"✅ Insight generated — action={result.get('suggested_action')}")
        return result
    except json.JSONDecodeError as e:
        logger.error(f"Insight JSON parse error: {e}")
        return MOCK_INSIGHT

def add_cross_doc_warnings(insights: list[dict], declarations: list) -> list[dict]:
    """Compare multiple documents uploaded in same session and add cross-doc warnings."""
    if len(declarations) < 2:
        return insights

    values = {d.filename: {
        "gross_weight": d.gross_weight,
        "currency": d.currency,
        "declared_value": d.declared_value,
    } for d in declarations}

    weights = [(fn, v["gross_weight"]) for fn, v in values.items() if v["gross_weight"]]
    currencies = [(fn, v["currency"]) for fn, v in values.items() if v["currency"]]

    warnings = []
    if len(weights) >= 2:
        wvals = [w for _, w in weights]
        if max(wvals) - min(wvals) > max(wvals) * 0.05:
            fns = ", ".join(f"{fn}: {w}kg" for fn, w in weights)
            warnings.append(f"Gross weight inconsistency across documents: {fns}")

    cur_set = set(c for _, c in currencies)
    if len(cur_set) > 1:
        warnings.append(f"Currency mismatch across documents: {', '.join(cur_set)}")

    for insight in insights:
        insight["cross_doc_warnings"] = warnings
        if warnings and insight.get("suggested_action") == "auto_approve":
            insight["suggested_action"] = "needs_review"
            insight["suggested_action_reason"] = f"Cross-document inconsistencies detected: {'; '.join(warnings)}"

    return insights
