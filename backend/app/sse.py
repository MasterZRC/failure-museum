"""Helpers for Server-Sent Events (SSE) streaming responses.

The ``X-Accel-Buffering: no`` header is important on Vercel / behind reverse
proxies: it tells the proxy not to buffer the whole body before flushing, so the
client sees status / token events incrementally instead of all at once.
"""
import json
from typing import Any

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def sse_event(event: str, data: Any) -> str:
    """Format a single SSE frame: an ``event:`` line plus a JSON ``data:`` line."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
