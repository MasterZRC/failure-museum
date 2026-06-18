from .. import store
from ..llm import embed_text
from ..schemas import SearchHit


def semantic_search(query: str, top_k: int = 8) -> list[SearchHit]:
    """Search only with online/fallback embeddings and local cosine ranking."""
    cards = store.list_cards()
    if not cards:
        return []

    q_emb = embed_text(query)
    vec_hits = store.query(q_emb, len(cards))

    results: list[SearchHit] = []
    for card, dist in vec_hits[:top_k]:
        results.append(SearchHit(card=card, score=round(max(0.0, 1.0 - dist), 3)))
    return results
