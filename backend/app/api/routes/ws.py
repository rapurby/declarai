from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
import asyncio, logging, json

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory connection registry: declaration_id → list of WebSocket connections
_connections: Dict[str, list[WebSocket]] = {}
# QR session registry: session_token → WebSocket (desktop)
_qr_connections: Dict[str, WebSocket] = {}

def get_connections():
    return _connections

def get_qr_connections():
    return _qr_connections

@router.websocket("/ws/declaration/{declaration_id}")
async def declaration_ws(websocket: WebSocket, declaration_id: str):
    await websocket.accept()
    _connections.setdefault(declaration_id, []).append(websocket)
    logger.info(f"WS connected for declaration {declaration_id}")
    try:
        while True:
            await asyncio.sleep(30)
            await websocket.send_json({"type": "ping"})
    except (WebSocketDisconnect, Exception):
        conns = _connections.get(declaration_id, [])
        if websocket in conns:
            conns.remove(websocket)
        logger.info(f"WS disconnected for declaration {declaration_id}")

@router.websocket("/ws/scan/{session_token}")
async def scan_ws(websocket: WebSocket, session_token: str):
    await websocket.accept()
    _qr_connections[session_token] = websocket
    logger.info(f"Desktop WS connected for scan session {session_token}")
    try:
        while True:
            await asyncio.sleep(30)
            await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        _qr_connections.pop(session_token, None)
        logger.info(f"Desktop WS disconnected for scan session {session_token}")

async def broadcast_status(declaration_id: str, data: dict):
    conns = _connections.get(str(declaration_id), [])
    dead = []
    for ws in conns:
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        conns.remove(ws)

async def notify_scan_complete(session_token: str, declaration_id: str):
    ws = _qr_connections.get(session_token)
    if ws:
        try:
            await ws.send_json({"type": "scan_complete", "declaration_id": declaration_id})
        except Exception:
            _qr_connections.pop(session_token, None)
