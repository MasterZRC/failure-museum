from collections import Counter

from fastapi import APIRouter, HTTPException

from .. import store
from ..schemas import FailureCard, IngestRequest, Stats
from ..services.ingest import save_card, structure_card

router = APIRouter(prefix="/api/cards", tags=["cards"])


@router.get("", response_model=list[FailureCard])
def list_cards() -> list[FailureCard]:
    return store.list_cards()


@router.get("/stats", response_model=Stats)
def stats() -> Stats:
    cards = store.list_cards()
    by_scenario = Counter(c.scenario or "未分类" for c in cards)
    by_severity = Counter(c.severity or "未分级" for c in cards)
    tag_counter: Counter = Counter()
    for c in cards:
        tag_counter.update(c.tags)
    return Stats(
        total=len(cards),
        by_scenario=dict(by_scenario),
        by_severity=dict(by_severity),
        top_tags=tag_counter.most_common(15),
    )


@router.get("/{card_id}", response_model=FailureCard)
def get_card(card_id: str) -> FailureCard:
    card = store.get_card(card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="failure card not found")
    return card


@router.post("/ingest", response_model=FailureCard)
def ingest_draft(req: IngestRequest) -> FailureCard:
    """Structure raw text into a draft failure card WITHOUT storing it.

    Human-in-the-loop: the frontend lets the user review/edit the draft, then
    calls POST /api/cards to actually publish it.
    """
    if not req.raw_text.strip():
        raise HTTPException(status_code=400, detail="raw_text is empty")
    return structure_card(req.raw_text, req.source_type)


@router.post("", response_model=FailureCard)
def create_card(card: FailureCard) -> FailureCard:
    return save_card(card)


@router.put("/{card_id}", response_model=FailureCard)
def update_card(card_id: str, card: FailureCard) -> FailureCard:
    card.id = card_id
    return save_card(card)
