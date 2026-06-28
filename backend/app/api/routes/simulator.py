from fastapi import APIRouter
from datetime import datetime
import random, uuid

router = APIRouter()

@router.post("/submit", summary="CEISA Simulator — test submissions without live API")
async def simulate_submission(payload: dict):
    """Simulates CEISA H2H response for training and testing."""
    # 90% acceptance rate simulation
    accepted = random.random() > 0.1
    if accepted:
        return {
            "status": "ACCEPTED",
            "registration_number": f"PIB-SIM-{datetime.now().strftime('%Y%m%d')}-{random.randint(10000,99999)}",
            "message": "Declaration accepted by CEISA [SIMULATOR]",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "simulator": True
        }
    else:
        return {
            "status": "REJECTED",
            "registration_number": None,
            "error_code": "CEISA-4022",
            "message": "HS Code does not match declared goods description [SIMULATOR]",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "simulator": True
        }

@router.get("/schema", summary="Get CEISA field schema reference")
async def get_schema():
    return {
        "declaration_type": "PIB (Pemberitahuan Impor Barang)",
        "mandatory_fields": [
            "hs_code", "consignee", "declared_value", "currency",
            "quantity", "unit", "description", "country_of_origin"
        ],
        "hs_code_format": "10 numeric digits (e.g. 8471300000)",
        "supported_currencies": ["USD", "EUR", "JPY", "CNY", "KRW", "SGD", "IDR", "GBP", "AUD"],
        "reference": "https://www.beacukai.go.id/ceisa"
    }
