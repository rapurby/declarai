import httpx, logging
from app.core.config import settings

logger = logging.getLogger(__name__)

async def submit_to_ceisa(payload: dict) -> dict:
    """Submit declaration to CEISA H2H API with retry logic."""
    if settings.APP_ENV == "development" or not settings.CEISA_API_KEY:
        logger.info("🔧 CEISA Simulator mode active")
        return _simulate_response(payload)

    headers = {
        "Authorization": f"Bearer {settings.CEISA_API_KEY}",
        "Content-Type": "application/json",
        "X-Service-Id": "declarai-v1"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        for attempt in range(3):
            try:
                resp = await client.post(
                    f"{settings.CEISA_API_URL}/h2h/declaration",
                    json=payload,
                    headers=headers
                )
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"CEISA HTTP error attempt {attempt+1}: {e}")
                if attempt == 2:
                    return {"status": "ERROR", "message": str(e)}
            except httpx.RequestError as e:
                logger.error(f"CEISA request error attempt {attempt+1}: {e}")
                if attempt == 2:
                    return {"status": "ERROR", "message": "CEISA API unreachable"}

def _simulate_response(payload: dict) -> dict:
    import random, datetime
    reg_num = f"PIB-{datetime.datetime.now().strftime('%Y%m%d')}-{random.randint(10000,99999)}"
    return {
        "status": "ACCEPTED",
        "registration_number": reg_num,
        "message": "Declaration successfully registered [SIMULATOR]",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "simulator": True
    }
