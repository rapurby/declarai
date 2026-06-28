import sys
sys.path.append(".")

from app.ocr.preprocessor import preprocess_image
from app.ocr.engine import run_ocr, ocr_to_plain_text
from app.llm.extractor import extract_fields
import json

# Load gambar invoice kamu
with open(r"C:\Users\ASUS\Desktop\DeclarAI\sample_docs\invoice.jpeg", "rb") as f:
    file_bytes = f.read()

print("=== STEP 1: Preprocessing ===")
preprocess_image(file_bytes)
print("✅ Done")

print("\n=== STEP 2: OCR ===")
ocr_results = run_ocr(file_bytes)
text = ocr_to_plain_text(ocr_results)
print(text)

print("\n=== STEP 3: LLM Extraction ===")
result = extract_fields(text)
print(json.dumps(result, indent=2))