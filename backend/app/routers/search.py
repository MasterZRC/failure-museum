from fastapi import APIRouter

from ..schemas import SearchHit, SearchRequest
from ..services.search import semantic_search

router = APIRouter(prefix="/api/search", tags=["search"])


@router.post("", response_model=list[SearchHit])
def search(req: SearchRequest) -> list[SearchHit]:
    return semantic_search(req.query, top_k=req.top_k)
