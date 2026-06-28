import logging
import numpy as np
from app.core.config import settings

logger = logging.getLogger(__name__)

_reader = None

def get_reader():
    global _reader
    if _reader is None:
        from rapidocr_onnxruntime import RapidOCR
        logger.info("Initializing RapidOCR engine...")
        _reader = RapidOCR()
        logger.info("✅ RapidOCR ready")
    return _reader

MOCK_OCR_RESULTS = [
    {"text": "COMMERCIAL INVOICE", "confidence": 0.99},
    {"text": "Invoice No: INV-2026-00123", "confidence": 0.97},
    {"text": "Invoice Date: 2026-05-15", "confidence": 0.96},
    {"text": "Shipper: SHENZHEN TECH CO LTD", "confidence": 0.95},
    {"text": "Consignee: PT CIKARANG DRY PORT", "confidence": 0.97},
    {"text": "NPWP: 01.234.567.8-901.000", "confidence": 0.88},
    {"text": "B/L No: COSCO2026051234", "confidence": 0.94},
    {"text": "Vessel: MV COSCO SHIPPING", "confidence": 0.92},
    {"text": "Voyage: 026W", "confidence": 0.90},
    {"text": "Port of Loading: Shenzhen, China", "confidence": 0.95},
    {"text": "Port of Discharge: Tanjung Priok, Indonesia", "confidence": 0.93},
    {"text": "Country of Origin: China", "confidence": 0.96},
    {"text": "HS Code: 8471300000", "confidence": 0.92},
    {"text": "Description: Laptop Computer Personal Use", "confidence": 0.91},
    {"text": "Quantity: 50 PCS", "confidence": 0.95},
    {"text": "Unit Price: USD 300.00", "confidence": 0.94},
    {"text": "Total Value (FOB): USD 15,000.00", "confidence": 0.96},
    {"text": "Freight: USD 500.00", "confidence": 0.89},
    {"text": "CIF Value: USD 15,500.00", "confidence": 0.93},
    {"text": "Gross Weight: 125.5 KG", "confidence": 0.93},
    {"text": "Net Weight: 110.0 KG", "confidence": 0.92},
    {"text": "Packages: 10 CARTONS", "confidence": 0.91},
    {"text": "Container Marks: SZX-2026-001", "confidence": 0.88},
]

def _pdf_to_images(file_bytes: bytes) -> list:
    try:
        import fitz  # PyMuPDF — no external binary needed
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        images = []
        for page in doc:
            mat = fitz.Matrix(200 / 72, 200 / 72)  # 200 DPI
            pix = page.get_pixmap(matrix=mat)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            if pix.n == 4:  # RGBA → RGB
                import cv2
                img = cv2.cvtColor(img, cv2.COLOR_RGBA2RGB)
            images.append(img)
        doc.close()
        return images
    except ImportError:
        from pdf2image import convert_from_bytes
        pil_images = convert_from_bytes(file_bytes, dpi=200)
        return [np.array(img) for img in pil_images]

def run_ocr(file_bytes: bytes, content_type: str = "image/jpeg") -> list:
    if settings.APP_ENV == "development":
        logger.info("🔧 Using mock OCR (development mode)")
        return MOCK_OCR_RESULTS

    if content_type == "application/pdf":
        images = _pdf_to_images(file_bytes)
    else:
        nparr = np.frombuffer(file_bytes, np.uint8)
        import cv2
        raw = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        images = [raw]

    reader = get_reader()
    extracted = []

    for img in images:
        # RapidOCR returns (result, elapse) — elapse may be list or float depending on version
        result, *_ = reader(img)
        if not result:
            continue
        for item in result:
            bbox, text, confidence = item
            text = str(text).strip()
            if text and float(confidence) > 0.4:
                extracted.append({
                    "text": text,
                    "confidence": round(float(confidence), 4),
                    "bbox": bbox,
                })

    logger.info(f"✅ RapidOCR extracted {len(extracted)} text regions")
    return extracted

def ocr_to_plain_text(ocr_results: list) -> str:
    return "\n".join(r["text"] for r in ocr_results)
