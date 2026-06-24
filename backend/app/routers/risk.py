from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..schemas import RiskCheckRequest, RiskReport
from ..services.risk import risk_check, risk_check_events
from ..sse import SSE_HEADERS, sse_event

router = APIRouter(prefix="/api/risk-check", tags=["risk-check"])


@router.post("", response_model=RiskReport)
def check(req: RiskCheckRequest) -> RiskReport:
    if not req.requirement.strip():
        raise HTTPException(status_code=400, detail="requirement is empty")
    return risk_check(req.requirement, req.context, top_k=req.top_k)


@router.post("/stream")
def check_stream(req: RiskCheckRequest) -> StreamingResponse:
    if not req.requirement.strip():
        raise HTTPException(status_code=400, detail="requirement is empty")

    def gen():
        for event, data in risk_check_events(
            req.requirement, req.context, top_k=req.top_k
        ):
            yield sse_event(event, data)

    return StreamingResponse(
        gen(), media_type="text/event-stream", headers=SSE_HEADERS
    )
