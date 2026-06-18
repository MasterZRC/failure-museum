from fastapi import APIRouter

from ..schemas import FailurePattern, GraphData
from ..services.graph import build_graph_data, list_patterns

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("", response_model=GraphData)
def graph() -> GraphData:
    return build_graph_data()


@router.get("/patterns", response_model=list[FailurePattern])
def patterns() -> list[FailurePattern]:
    return list_patterns()
