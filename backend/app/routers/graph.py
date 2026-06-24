from fastapi import APIRouter

from ..schemas import FailurePattern, GraphData
from ..services.graph import build_graph_data, list_patterns

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("", response_model=GraphData)
def graph(llm: bool = True) -> GraphData:
    return build_graph_data(use_llm=llm)


@router.get("/patterns", response_model=list[FailurePattern])
def patterns(llm: bool = True) -> list[FailurePattern]:
    return list_patterns(use_llm=llm)
