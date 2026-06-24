from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..schemas import CuratorChatRequest, CuratorChatResponse
from ..services.curator import chat, chat_events
from ..sse import SSE_HEADERS, sse_event

router = APIRouter(prefix="/api/curator", tags=["curator"])


@router.post("/chat", response_model=CuratorChatResponse)
def curator_chat(req: CuratorChatRequest) -> CuratorChatResponse:
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages is empty")
    return chat(req.messages)


@router.post("/chat/stream")
def curator_chat_stream(req: CuratorChatRequest) -> StreamingResponse:
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages is empty")

    def gen():
        for event, data in chat_events(req.messages):
            yield sse_event(event, data)

    return StreamingResponse(
        gen(), media_type="text/event-stream", headers=SSE_HEADERS
    )
