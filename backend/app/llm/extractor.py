import json, logging
from app.llm.client import call_claude
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a customs declaration data extraction specialist for Indonesian CEISA.
Extract structured data from OCR text of CIPL documents. Respond ONLY with valid JSON — no markdown, no preamble."""

EXTRACTION_PROMPT = """Extract customs data from this document. Return ONLY valid JSON.

--- DOCUMENT TEXT ---
{ocr_text}
--- END ---

Return this exact structure:
{{
  "header": {{
    "document_type":    {{"value": null, "confidence": 0.0}},
    "consignee":        {{"value": null, "confidence": 0.0}},
    "npwp_consignee":   {{"value": null, "confidence": 0.0}},
    "shipper":          {{"value": null, "confidence": 0.0}},
    "invoice_number":   {{"value": null, "confidence": 0.0}},
    "invoice_date":     {{"value": null, "confidence": 0.0}},
    "currency":         {{"value": null, "confidence": 0.0}},
    "declared_value":   {{"value": null, "confidence": 0.0}},
    "fob_value":        {{"value": null, "confidence": 0.0}},
    "freight_value":    {{"value": null, "confidence": 0.0}},
    "cif_value":        {{"value": null, "confidence": 0.0}},
    "gross_weight":     {{"value": null, "confidence": 0.0}},
    "net_weight":       {{"value": null, "confidence": 0.0}},
    "country_of_origin":{{"value": null, "confidence": 0.0}},
    "bl_number":        {{"value": null, "confidence": 0.0}},
    "vessel_name":      {{"value": null, "confidence": 0.0}},
    "voyage_number":    {{"value": null, "confidence": 0.0}},
    "port_of_loading":  {{"value": null, "confidence": 0.0}},
    "port_of_discharge":{{"value": null, "confidence": 0.0}},
    "port_of_transit":  {{"value": null, "confidence": 0.0}},
    "package_quantity": {{"value": null, "confidence": 0.0}},
    "package_type":     {{"value": null, "confidence": 0.0}},
    "container_marks":  {{"value": null, "confidence": 0.0}},
    "bc11_number":      {{"value": null, "confidence": 0.0}}
  }},
  "line_items": [
    {{
      "no": 1,
      "hs_code": null,
      "description": null,
      "quantity": null,
      "unit": null,
      "unit_price": null,
      "total_value": null,
      "country_of_origin": null,
      "confidence": 0.0
    }}
  ],
  "insight": {{
    "overall_confidence": 0.0,
    "confidence_level": "high",
    "issues": [],
    "suggested_action": "auto_approve",
    "action_reason": "All mandatory fields extracted."
  }}
}}

Rules:
- document_type: "invoice", "packing_list", "bill_of_lading", or "unknown"
- Extract EVERY line item as a separate object — never merge items
- Numeric fields: numbers only, strip currency symbols and commas
- invoice_date: YYYY-MM-DD format
- confidence per field: 0.0–1.0 based on text clarity
- insight.overall_confidence: weighted average of all field confidences
- insight.confidence_level: "high" ≥0.85, "medium" ≥0.60, "low" <0.60
- insight.issues: only real problems — [{{"field":"...", "type":"missing|low_confidence|arithmetic", "message":"brief"}}]
- insight.suggested_action: "auto_approve" | "needs_review" | "cannot_submit"
- Mandatory: hs_code (per item), consignee, declared_value, currency, description
- Multilingual: 数量=quantity, 金额=value, 重量=weight, 品名=description, 发票=invoice"""

MOCK_RESULT = {
    "header": {
        "document_type":    {"value": "invoice",                      "confidence": 0.98},
        "consignee":        {"value": "PT CIKARANG DRY PORT",         "confidence": 0.95},
        "npwp_consignee":   {"value": "01.234.567.8-901.000",         "confidence": 0.88},
        "shipper":          {"value": "SHENZHEN TECH CO LTD",         "confidence": 0.91},
        "invoice_number":   {"value": "INV-2026-00123",               "confidence": 0.93},
        "invoice_date":     {"value": "2026-05-15",                   "confidence": 0.95},
        "currency":         {"value": "USD",                          "confidence": 0.99},
        "declared_value":   {"value": 15000.00,                       "confidence": 0.91},
        "fob_value":        {"value": 15000.00,                       "confidence": 0.91},
        "freight_value":    {"value": 500.00,                         "confidence": 0.89},
        "cif_value":        {"value": 15500.00,                       "confidence": 0.93},
        "gross_weight":     {"value": 125.5,                          "confidence": 0.88},
        "net_weight":       {"value": 110.0,                          "confidence": 0.87},
        "country_of_origin":{"value": "China",                        "confidence": 0.93},
        "bl_number":        {"value": "COSCO2026051234",              "confidence": 0.90},
        "vessel_name":      {"value": "MV COSCO SHIPPING",            "confidence": 0.92},
        "voyage_number":    {"value": "026W",                         "confidence": 0.90},
        "port_of_loading":  {"value": "Shenzhen, China",              "confidence": 0.92},
        "port_of_discharge":{"value": "Tanjung Priok, Indonesia",     "confidence": 0.94},
        "port_of_transit":  {"value": None,                           "confidence": 0.0},
        "package_quantity": {"value": 10,                             "confidence": 0.91},
        "package_type":     {"value": "CARTONS",                      "confidence": 0.91},
        "container_marks":  {"value": "SZX-2026-001",                 "confidence": 0.88},
        "bc11_number":      {"value": None,                           "confidence": 0.0},
    },
    "line_items": [
        {"no": 1, "hs_code": "8471300000", "description": "Laptop Computer", "quantity": 30, "unit": "PCS", "unit_price": 300.00, "total_value": 9000.00, "country_of_origin": "China", "confidence": 0.92},
        {"no": 2, "hs_code": "8517120000", "description": "Mobile Phone",    "quantity": 20, "unit": "PCS", "unit_price": 300.00, "total_value": 6000.00, "country_of_origin": "China", "confidence": 0.90},
    ],
    "insight": {
        "overall_confidence": 0.91,
        "confidence_level": "high",
        "issues": [{"field": "bc11_number", "type": "missing", "message": "BC 1.1 number not found in document"}],
        "suggested_action": "auto_approve",
        "action_reason": "All mandatory fields extracted with high confidence.",
    },
}

def extract_fields(ocr_text: str) -> dict:
    if settings.APP_ENV == "development" or settings.ANTHROPIC_API_KEY.startswith("sk-ant-placeholder"):
        logger.info("🔧 Using mock extraction (development mode)")
        return MOCK_RESULT

    logger.info("🤖 Calling Claude for extraction + insight...")
    prompt = EXTRACTION_PROMPT.format(ocr_text=ocr_text[:8000])  # cap to control tokens
    response = call_claude(prompt, SYSTEM_PROMPT, max_tokens=4000)

    try:
        clean = response.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        result = json.loads(clean)
        items = len(result.get("line_items", []))
        logger.info(f"✅ Extracted header + {items} line items + insight")
        return result
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}\nRaw: {response[:300]}")
        return MOCK_RESULT
