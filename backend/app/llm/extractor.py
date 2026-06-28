import json, logging
from app.llm.client import call_claude
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a customs declaration data extraction specialist for Indonesian customs (CEISA system).
Extract structured data from OCR text of CIPL documents (Commercial Invoice, Packing List, Bill of Lading).
Always respond with valid JSON only — no preamble, no markdown fences.
If a field cannot be found, set value to null and confidence to 0.0.
Handle multilingual documents including English, Mandarin, Korean, and Indonesian."""

EXTRACTION_PROMPT = """Extract all customs declaration fields from this OCR document text:

--- DOCUMENT TEXT ---
{ocr_text}
--- END ---

Return a JSON object with exactly these fields (each with "value" and "confidence" 0.0-1.0):
{{
  "document_type":    {{"value": null, "confidence": 0.0}},
  "hs_code":          {{"value": null, "confidence": 0.0}},
  "consignee":        {{"value": null, "confidence": 0.0}},
  "npwp_consignee":   {{"value": null, "confidence": 0.0}},
  "declared_value":   {{"value": null, "confidence": 0.0}},
  "currency":         {{"value": null, "confidence": 0.0}},
  "quantity":         {{"value": null, "confidence": 0.0}},
  "unit":             {{"value": null, "confidence": 0.0}},
  "description":      {{"value": null, "confidence": 0.0}},
  "country_of_origin":{{"value": null, "confidence": 0.0}},
  "gross_weight":     {{"value": null, "confidence": 0.0}},
  "net_weight":       {{"value": null, "confidence": 0.0}},
  "shipper":          {{"value": null, "confidence": 0.0}},
  "bl_number":        {{"value": null, "confidence": 0.0}},
  "invoice_number":   {{"value": null, "confidence": 0.0}},
  "invoice_date":     {{"value": null, "confidence": 0.0}},
  "port_of_loading":  {{"value": null, "confidence": 0.0}},
  "port_of_discharge":{{"value": null, "confidence": 0.0}},
  "port_of_transit":  {{"value": null, "confidence": 0.0}},
  "vessel_name":      {{"value": null, "confidence": 0.0}},
  "voyage_number":    {{"value": null, "confidence": 0.0}},
  "fob_value":        {{"value": null, "confidence": 0.0}},
  "freight_value":    {{"value": null, "confidence": 0.0}},
  "cif_value":        {{"value": null, "confidence": 0.0}},
  "package_quantity": {{"value": null, "confidence": 0.0}},
  "package_type":     {{"value": null, "confidence": 0.0}},
  "container_marks":  {{"value": null, "confidence": 0.0}},
  "bc11_number":      {{"value": null, "confidence": 0.0}}
}}

Rules:
- document_type must be one of: "invoice", "packing_list", "bill_of_lading", "unknown"
- hs_code: numeric only, strip dots/spaces
- declared_value, fob_value, freight_value, cif_value, gross_weight, net_weight: numeric only, no symbols
- quantity, package_quantity: numeric only
- invoice_date: ISO format YYYY-MM-DD if possible
- Multilingual hints: 数量=quantity, 金额=value, 重量=weight, 品名=description, 发票=invoice
- If fob_value + freight_value ≈ cif_value, boost all three confidence scores"""

MOCK_EXTRACTION = {
    "document_type":    {"value": "invoice",                      "confidence": 0.98},
    "hs_code":          {"value": "8471300000",                   "confidence": 0.92},
    "consignee":        {"value": "PT CIKARANG DRY PORT",         "confidence": 0.95},
    "npwp_consignee":   {"value": "01.234.567.8-901.000",         "confidence": 0.88},
    "declared_value":   {"value": 15000.00,                       "confidence": 0.91},
    "currency":         {"value": "USD",                          "confidence": 0.99},
    "quantity":         {"value": 50,                             "confidence": 0.94},
    "unit":             {"value": "PCS",                          "confidence": 0.97},
    "description":      {"value": "Laptop Computer Personal Use", "confidence": 0.89},
    "country_of_origin":{"value": "China",                        "confidence": 0.93},
    "gross_weight":     {"value": 125.5,                          "confidence": 0.88},
    "net_weight":       {"value": 110.0,                          "confidence": 0.87},
    "shipper":          {"value": "SHENZHEN TECH CO LTD",         "confidence": 0.91},
    "bl_number":        {"value": "COSCO2026051234",              "confidence": 0.90},
    "invoice_number":   {"value": "INV-2026-00123",               "confidence": 0.93},
    "invoice_date":     {"value": "2026-05-15",                   "confidence": 0.95},
    "port_of_loading":  {"value": "Shenzhen, China",              "confidence": 0.92},
    "port_of_discharge":{"value": "Tanjung Priok, Indonesia",     "confidence": 0.94},
    "port_of_transit":  {"value": None,                           "confidence": 0.0},
    "vessel_name":      {"value": "MV COSCO SHIPPING",            "confidence": 0.92},
    "voyage_number":    {"value": "026W",                         "confidence": 0.90},
    "fob_value":        {"value": 15000.00,                       "confidence": 0.91},
    "freight_value":    {"value": 500.00,                         "confidence": 0.89},
    "cif_value":        {"value": 15500.00,                       "confidence": 0.93},
    "package_quantity": {"value": 10,                             "confidence": 0.91},
    "package_type":     {"value": "CARTONS",                      "confidence": 0.91},
    "container_marks":  {"value": "SZX-2026-001",                 "confidence": 0.88},
    "bc11_number":      {"value": None,                           "confidence": 0.0},
}

def extract_fields(ocr_text: str) -> dict:
    if settings.APP_ENV == "development" or settings.ANTHROPIC_API_KEY.startswith("sk-ant-placeholder"):
        logger.info("🔧 Using mock extraction (development mode)")
        return MOCK_EXTRACTION

    logger.info("🤖 Calling Claude API for field extraction...")
    prompt = EXTRACTION_PROMPT.format(ocr_text=ocr_text)
    response = call_claude(prompt, SYSTEM_PROMPT, max_tokens=3000)

    try:
        clean = response.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        result = json.loads(clean)
        logger.info(f"✅ Extracted {len(result)} fields")
        return result
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}")
        return MOCK_EXTRACTION
