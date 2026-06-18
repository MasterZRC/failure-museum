import hashlib
import json
import math
from pathlib import Path
from typing import TypedDict

from .config import get_settings
from .schemas import FailureCard


class _StoredCard(TypedDict):
    card: dict
    embedding: list[float]


_records: dict[str, _StoredCard] | None = None


def _store_path() -> Path:
    return Path(get_settings().storage_file)


def _load_records() -> dict[str, _StoredCard]:
    global _records
    if _records is not None:
        return _records

    path = _store_path()
    if not path.exists():
        _records = {}
        return _records

    with path.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    _records = {item["card"]["id"]: item for item in raw.get("cards", [])}
    return _records


def _save_records(records: dict[str, _StoredCard]) -> None:
    path = _store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"cards": list(records.values())}
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def reset() -> None:
    """Clear local JSON storage and in-process cache."""
    global _records
    _records = {}
    path = _store_path()
    if path.exists():
        path.unlink()


def build_search_text(card: FailureCard) -> str:
    """Compose the text that gets embedded / tokenized for retrieval.

    Includes root cause + warning signals + checklist so that two failures with
    different surface keywords but the same underlying lesson land close together.
    """
    parts = [
        f"[scenario] {card.scenario}",
        f"[failure] {card.title}. {card.one_line}",
        f"[root_cause] {card.root_cause}",
        f"[warning] {'; '.join(card.warning_signals)}",
        f"[lesson] {'; '.join(card.checklist)}",
        f"[what_happened] {card.what_happened}",
        f"[tags] {', '.join(card.tags + card.tech_domains)}",
    ]
    return "\n".join(p for p in parts if p.split("] ", 1)[-1].strip())


def add_card(card: FailureCard, embedding: list[float]) -> None:
    records = _load_records()
    records[card.id] = {
        "card": card.model_dump(mode="json"),
        "embedding": embedding,
    }
    _save_records(records)


def get_card(card_id: str) -> FailureCard | None:
    item = _load_records().get(card_id)
    if item is None:
        return None
    return FailureCard.model_validate(item["card"])


def list_cards() -> list[FailureCard]:
    return [FailureCard.model_validate(item["card"]) for item in _load_records().values()]


def list_with_embeddings() -> list[tuple[FailureCard, list[float]]]:
    """Return every stored card paired with its persisted embedding vector."""
    return [
        (FailureCard.model_validate(item["card"]), item["embedding"])
        for item in _load_records().values()
    ]


def signature() -> str:
    """A cheap fingerprint of the current collection, for cache invalidation."""
    ids = sorted(_load_records().keys())
    return hashlib.md5("|".join(ids).encode("utf-8")).hexdigest()


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if not norm_a or not norm_b:
        return 0.0
    return dot / (norm_a * norm_b)


def query(embedding: list[float], top_k: int) -> list[tuple[FailureCard, float]]:
    hits: list[tuple[FailureCard, float]] = []
    for item in _load_records().values():
        card = FailureCard.model_validate(item["card"])
        similarity = _cosine_similarity(embedding, item["embedding"])
        distance = 1.0 - similarity
        hits.append((card, distance))
    return sorted(hits, key=lambda x: x[1])[:top_k]


def count() -> int:
    return len(_load_records())
