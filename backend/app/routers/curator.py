from fastapi import APIRouter, HTTPException

from ..schemas import CuratorChatRequest, CuratorChatResponse
from ..services.curator import chat

router = APIRouter(prefix="/api/curator", tags=["curator"])


@router.post("/chat", response_model=CuratorChatResponse)
def curator_chat(req: CuratorChatRequest) -> CuratorChatResponse:
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages is empty")
    return chat(req.messages)
