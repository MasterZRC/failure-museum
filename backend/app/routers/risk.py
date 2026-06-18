from fastapi import APIRouter, HTTPException

from ..schemas import RiskCheckRequest, RiskReport
from ..services.risk import risk_check

router = APIRouter(prefix="/api/risk-check", tags=["risk-check"])


@router.post("", response_model=RiskReport)
def check(req: RiskCheckRequest) -> RiskReport:
    if not req.requirement.strip():
        raise HTTPException(status_code=400, detail="requirement is empty")
    return risk_check(req.requirement, req.context, top_k=req.top_k)
