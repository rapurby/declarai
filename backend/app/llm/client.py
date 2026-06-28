import anthropic
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)
_client = None

def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client

def call_claude(prompt: str, system_prompt: str = "", max_tokens: int = 2048) -> str:
    client = get_client()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": prompt}]
    )
    return message.content[0].text
