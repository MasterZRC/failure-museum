"""Failure DNA graph: connect cards, cluster by shared mechanism, name patterns.

Turns a flat collection of failure cards into a knowledge network:
  * edges    = kNN over embedding cosine similarity (who is mechanistically close)
  * clusters = greedy modularity communities (recurring "failure patterns")
  * patterns = one LLM pass per cluster to name the pattern + defense principle
               + the organization-level systemic-risk insight (cached on disk).

Everything degrades gracefully without an API key (numeric clustering + rule-based
naming) so the demo always renders.
"""
from __future__ import annotations

import hashlib
import json
import math
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .. import blob_store, store
from ..config import get_settings
from ..llm import chat_json
from ..schemas import (
    FailurePattern,
    GraphData,
    GraphEdge,
    GraphNode,
    SystemicPattern,
)

_KNN = 3
_MIN_SIM = 0.1
_RESOLUTION = 2.2
_SEVERITY_ORDER = ["P0", "P1", "P2", "P3"]

PATTERN_SYSTEM = """你是失败博物馆的策展研究员。给定同一聚类下的若干"失败卡"，请提炼它们共同的"失败模式"。
只输出 JSON 对象，全部使用简体中文：
{
 "name": "失败模式名（4-12字，点出共同根因，如 幂等与防刷缺失、单一短期指标陷阱）",
 "principle": "一句话防御原则，团队可内化的'抗体'",
 "systemic_risk": "一句话系统性风险洞察，强调这是反复出现、跨业务域的组织级问题"
}"""

# (signature, data, fully_named): fully_named is True when every cluster with
# >=2 members got a non-fallback (LLM / cached) name, so we know whether the
# cached graph can still be upgraded by a later use_llm=True request.
_cache: tuple[str, GraphData, bool] | None = None


# --------------------------------------------------------------------------- #
# similarity + topology
# --------------------------------------------------------------------------- #
def _cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if not na or not nb:
        return 0.0
    return dot / (na * nb)


def _sim_matrix(embs: list[list[float]]) -> list[list[float]]:
    n = len(embs)
    lengths = {len(e) for e in embs}
    if n and len(lengths) == 1 and 0 not in lengths:
        try:
            import numpy as np

            m = np.asarray(embs, dtype=float)
            norms = np.linalg.norm(m, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            normed = m / norms
            return (normed @ normed.T).tolist()
        except Exception:
            pass
    return [[_cosine(embs[i], embs[j]) for j in range(n)] for i in range(n)]


def _knn_edges(sim: list[list[float]], k: int, min_sim: float) -> dict[tuple[int, int], float]:
    n = len(sim)
    edges: dict[tuple[int, int], float] = {}
    for i in range(n):
        order = sorted(range(n), key=lambda j: sim[i][j], reverse=True)
        added = 0
        for j in order:
            if j == i:
                continue
            s = float(sim[i][j])
            if s < min_sim:
                break
            key = (i, j) if i < j else (j, i)
            if key not in edges or edges[key] < s:
                edges[key] = s
            added += 1
            if added >= k:
                break
    return edges


def _cluster(
    n: int, edges: dict[tuple[int, int], float], resolution: float = 1.0
) -> list[list[int]]:
    if n == 0:
        return []
    try:
        import networkx as nx

        g = nx.Graph()
        g.add_nodes_from(range(n))
        for (i, j), w in edges.items():
            g.add_edge(i, j, weight=w)
        try:
            raw = nx.community.greedy_modularity_communities(
                g, weight="weight", resolution=resolution
            )
        except TypeError:
            raw = nx.community.greedy_modularity_communities(g, weight="weight")
        comms = [sorted(c) for c in raw]
        if comms:
            return sorted(comms, key=len, reverse=True)
    except Exception:
        pass
    # fallback: union-find over edges
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for (i, j) in edges:
        parent[find(i)] = find(j)
    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    return sorted(groups.values(), key=len, reverse=True)


# --------------------------------------------------------------------------- #
# pattern naming (LLM + disk cache)
# --------------------------------------------------------------------------- #
_NAME_CACHE_BLOB = "patterns.json"
_GRAPH_CACHE_BLOB = "graph.json"


def _cache_path() -> Path:
    return Path(get_settings().storage_file).parent / "patterns.json"


def _load_name_cache() -> dict:
    if blob_store.blob_enabled():
        return blob_store.read_json(_NAME_CACHE_BLOB) or {}

    path = _cache_path()
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_name_cache(cache: dict) -> None:
    if blob_store.blob_enabled():
        blob_store.write_json(_NAME_CACHE_BLOB, cache)
        return

    path = _cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _load_graph_cache(sig: str) -> GraphData | None:
    """Return the persisted GraphData if it matches the current collection."""
    if not blob_store.blob_enabled():
        return None
    blob = blob_store.read_json(_GRAPH_CACHE_BLOB)
    if not blob or blob.get("signature") != sig:
        return None
    try:
        return GraphData.model_validate(blob["data"])
    except Exception:
        return None


def _save_graph_cache(sig: str, data: GraphData) -> None:
    if not blob_store.blob_enabled():
        return
    blob_store.write_json(
        _GRAPH_CACHE_BLOB, {"signature": sig, "data": data.model_dump(mode="json")}
    )


def _members_key(card_ids: list[str]) -> str:
    return hashlib.md5("|".join(sorted(card_ids)).encode("utf-8")).hexdigest()


def _fallback_name(members: list) -> tuple[str, str, str]:
    tag_counter: Counter = Counter()
    for c in members:
        tag_counter.update(c.tags)
    top_tag = tag_counter.most_common(1)[0][0] if tag_counter else (members[0].scenario or "未归类")
    domains = _ordered_unique([d for c in members for d in c.tech_domains])
    name = f"{top_tag}类失败模式"
    principle = f"凡涉及「{top_tag}」的方案，上线前必须按本模式逐项防御。"
    risk = (
        f"该失败模式已在馆藏中出现 {len(members)} 次"
        + (f"，横跨 {('、'.join(domains[:3]))} 等 {len(domains)} 个领域" if domains else "")
        + "，属于反复发生的组织级系统性风险。"
    )
    return name, principle, risk


def _llm_name_members(members: list) -> tuple[str, str, str] | None:
    """Ask the LLM to name one cluster. Returns None on failure / empty name."""
    try:
        payload = json.dumps(
            [
                {
                    "id": c.id,
                    "title": c.title,
                    "one_line": c.one_line,
                    "root_cause": c.root_cause,
                    "scenario": c.scenario,
                    "tags": c.tags,
                }
                for c in members
            ],
            ensure_ascii=False,
        )
        data = chat_json(PATTERN_SYSTEM, payload)
        name = str(data.get("name", "")).strip()
        principle = str(data.get("principle", "")).strip()
        risk = str(data.get("systemic_risk", "")).strip()
        if name:
            return name, principle, risk
    except Exception:
        pass
    return None


def _name_clusters(
    communities: list[list[int]], cards: list, name_cache: dict, do_llm: bool
) -> tuple[list[tuple[str, str, str, bool]], bool]:
    """Name every cluster, parallelising the (independent) LLM calls.

    Returns ``(names, fully_named)`` where ``names[i]`` is
    ``(name, principle, systemic_risk, llm_used)`` aligned to ``communities`` and
    ``fully_named`` is True only when no cluster with >=2 members fell back to
    rule-based naming (i.e. the result is worth persisting / not re-upgrading).
    """
    members_by_idx = [[cards[m] for m in idxs] for idxs in communities]
    keys = [_members_key([c.id for c in members]) for members in members_by_idx]

    results: list[tuple[str, str, str, bool] | None] = [None] * len(communities)

    # 1) instant cache hits
    for i, key in enumerate(keys):
        cached = name_cache.get(key)
        if cached is not None:
            results[i] = (
                cached.get("name", ""),
                cached.get("principle", ""),
                cached.get("systemic_risk", ""),
                True,
            )

    # 2) clusters still missing a name and eligible for LLM naming (>=2 members)
    missing = [
        i
        for i in range(len(communities))
        if results[i] is None and len(members_by_idx[i]) >= 2
    ]

    if do_llm and missing and get_settings().llm_enabled:
        with ThreadPoolExecutor(max_workers=min(len(missing), 6)) as pool:
            llm_out = list(pool.map(lambda i: _llm_name_members(members_by_idx[i]), missing))
        for i, out in zip(missing, llm_out):
            if out is not None:
                name, principle, risk = out
                name_cache[keys[i]] = {
                    "name": name,
                    "principle": principle,
                    "systemic_risk": risk,
                }
                results[i] = (name, principle, risk, True)

    # 3) anything still unnamed -> rule-based fallback (not written to cache so a
    #    later use_llm=True pass can still upgrade it)
    fully_named = True
    for i, members in enumerate(members_by_idx):
        if results[i] is None:
            name, principle, risk = _fallback_name(members)
            results[i] = (name, principle, risk, False)
            if len(members) >= 2:
                fully_named = False

    return [r for r in results if r is not None], fully_named


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _ordered_unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        k = (it or "").strip()
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    return out


def _severity_max(members: list) -> str:
    present = [c.severity for c in members if c.severity in _SEVERITY_ORDER]
    for s in _SEVERITY_ORDER:
        if s in present:
            return s
    return ""


# --------------------------------------------------------------------------- #
# public API
# --------------------------------------------------------------------------- #
def build_graph_data(use_llm: bool = True) -> GraphData:
    """Build (and memoize) the full failure graph for the current collection.

    When ``use_llm`` is False (hot paths: risk-check, curator, gallery count,
    card detail) cluster naming never blocks on the LLM -- it returns instantly
    with cached LLM names where available and rule-based fallbacks otherwise.
    Only the graph page calls with ``use_llm=True`` to (re)generate and persist
    the LLM names, after which every path shares the upgraded result.
    """
    global _cache
    sig = store.signature()
    if _cache is not None and _cache[0] == sig:
        cached_data, fully_named = _cache[1], _cache[2]
        # Serve the in-process cache unless the caller wants LLM names and the
        # cached graph is still only fallback-named (i.e. can be upgraded).
        if fully_named or not use_llm:
            return cached_data

    # On a fresh serverless instance the in-process cache is empty; reuse the
    # Blob-persisted graph so cold starts don't recompute or re-call the LLM.
    cached = _load_graph_cache(sig)
    if cached is not None:
        _cache = (sig, cached, True)
        return cached

    pairs = store.list_with_embeddings()
    cards = [c for c, _ in pairs]
    embs = [e for _, e in pairs]
    n = len(cards)

    if n == 0:
        data = GraphData(nodes=[], edges=[], patterns=[], llm_used=False)
        _cache = (sig, data, True)
        _save_graph_cache(sig, data)
        return data

    sim = _sim_matrix(embs)
    edge_map = _knn_edges(sim, _KNN, _MIN_SIM)
    communities = _cluster(n, edge_map, resolution=_RESOLUTION)

    cluster_of: dict[int, str] = {}
    for idx, members in enumerate(communities):
        for node_idx in members:
            cluster_of[node_idx] = f"c{idx}"

    degree: dict[int, int] = {i: 0 for i in range(n)}
    for (i, j) in edge_map:
        degree[i] += 1
        degree[j] += 1

    nodes = [
        GraphNode(
            id=cards[i].id,
            title=cards[i].title,
            one_line=cards[i].one_line,
            scenario=cards[i].scenario,
            severity=cards[i].severity,
            tags=cards[i].tags,
            tech_domains=cards[i].tech_domains,
            cluster=cluster_of.get(i, "c0"),
            degree=degree.get(i, 0),
        )
        for i in range(n)
    ]

    edges = []
    for (i, j), w in edge_map.items():
        shared = _ordered_unique(
            [
                t
                for t in (cards[i].tags + cards[i].tech_domains)
                if t in set(cards[j].tags + cards[j].tech_domains)
            ]
        )
        edges.append(
            GraphEdge(source=cards[i].id, target=cards[j].id, weight=round(w, 3), shared=shared)
        )

    name_cache = _load_name_cache()
    cache_size_before = len(name_cache)
    names, fully_named = _name_clusters(communities, cards, name_cache, use_llm)
    any_llm = False
    patterns: list[FailurePattern] = []
    for idx, member_idxs in enumerate(communities):
        members = [cards[m] for m in member_idxs]
        name, principle, risk, llm_used = names[idx]
        any_llm = any_llm or llm_used
        patterns.append(
            FailurePattern(
                id=f"c{idx}",
                name=name,
                principle=principle,
                systemic_risk=risk,
                member_ids=[c.id for c in members],
                domains=_ordered_unique([d for c in members for d in c.tech_domains]),
                scenarios=_ordered_unique([c.scenario for c in members]),
                count=len(members),
                severity_max=_severity_max(members),
                llm_used=llm_used,
            )
        )

    if len(name_cache) != cache_size_before:
        _save_name_cache(name_cache)

    data = GraphData(nodes=nodes, edges=edges, patterns=patterns, llm_used=any_llm)
    _cache = (sig, data, fully_named)
    # Only persist a fully-named graph so a fallback-only build never gets frozen
    # into the Blob cache and blocks future LLM upgrades.
    if fully_named:
        _save_graph_cache(sig, data)
    return data


def list_patterns(use_llm: bool = True) -> list[FailurePattern]:
    return build_graph_data(use_llm=use_llm).patterns


def patterns_for_cards(card_ids: list[str], min_count: int = 2) -> list[SystemicPattern]:
    """Map a set of matched card ids to the recurring patterns they belong to."""
    wanted = set(card_ids)
    out: list[SystemicPattern] = []
    # Hot path (risk-check): never block on LLM cluster naming.
    for p in build_graph_data(use_llm=False).patterns:
        if p.count < min_count:
            continue
        hit = [cid for cid in p.member_ids if cid in wanted]
        if not hit:
            continue
        out.append(
            SystemicPattern(
                id=p.id,
                name=p.name,
                principle=p.principle,
                systemic_risk=p.systemic_risk,
                count=p.count,
                domains=p.domains,
                matched_card_ids=hit,
            )
        )
    out.sort(key=lambda s: s.count, reverse=True)
    return out
