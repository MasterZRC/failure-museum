import json
from typing import Any, Iterator

from ..config import get_settings
from ..llm import chat_json
from ..schemas import MatchedFailure, RiskAlert, RiskReport, SearchHit
from .graph import patterns_for_cards
from .search import semantic_search

REPORT_MAX_TOKENS = 800

NORMALIZE_SYSTEM = """你是需求分析助手。请把用户输入的"新需求"扩展成便于检索历史失败的描述。
只输出 JSON 对象，全部使用简体中文：
{
 "scenario": "业务场景",
 "actions": ["关键动作"],
 "risk_keywords": ["可能相关的风险关键词，如 防刷、接口幂等、成本控制、灰度发布、异常状态、对账、限流 等"],
 "query_text": "一段融合了场景、关键动作与潜在风险词、用于语义检索的扩写文本"
}"""

RISK_SYSTEM = """你是"失败博物馆"的上线前风险体检助手。给定一个"新需求"和若干条"历史失败卡"，请判断历史失败与新需求的本质关联，并生成上线前风险预警。

要求：
1. 只输出 JSON 对象，不要多余文字。
2. 每条匹配/风险都必须来自给定的历史失败卡，from_card 必须等于给定失败卡的 id；不要编造历史中不存在的失败。
3. pre_launch_checklist 要具体、可执行、聚焦本次新需求。
4. questions_to_think 用来逼团队思考边界与副作用。
5. 全部使用简体中文。

输出 JSON 字段：
{
 "matched_failures": [{"id": "失败卡id", "title": "标题", "why_relevant": "为什么与新需求本质相关"}],
 "risk_alerts": [{"risk": "风险描述", "from_card": "失败卡id", "severity": "高/中/低"}],
 "pre_launch_checklist": ["检查项"],
 "questions_to_think": ["待思考问题"]
}"""


def _normalize(requirement: str, context: str) -> dict:
    settings = get_settings()
    if settings.llm_enabled:
        try:
            user = f"新需求：{requirement}\n补充背景：{context}".strip()
            data = chat_json(NORMALIZE_SYSTEM, user)
            if not data.get("query_text"):
                data["query_text"] = f"{requirement} {context}".strip()
            return data
        except Exception:
            pass
    return {
        "scenario": "",
        "actions": [],
        "risk_keywords": [],
        "query_text": f"{requirement} {context}".strip(),
    }


def _raw_normalized(requirement: str, context: str) -> dict:
    return {
        "scenario": "",
        "actions": [],
        "risk_keywords": [],
        "query_text": f"{requirement} {context}".strip(),
    }


def _cards_payload(hits: list[SearchHit]) -> list[dict]:
    payload = []
    for h in hits:
        c = h.card
        payload.append(
            {
                "id": c.id,
                "title": c.title,
                "one_line": c.one_line,
                "scenario": c.scenario,
                "tags": c.tags,
                "root_cause": c.root_cause,
                "warning_signals": c.warning_signals,
                "checklist": c.checklist,
            }
        )
    return payload


def _dedup(items: list[str]) -> list[str]:
    seen = set()
    out = []
    for it in items:
        key = it.strip()
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return out


def _fallback_report(requirement: str, normalized: dict, hits: list[SearchHit]) -> RiskReport:
    matched = [
        MatchedFailure(
            id=h.card.id,
            title=h.card.title,
            similarity=h.score,
            why_relevant=h.card.one_line or "场景与关键动作相近",
        )
        for h in hits
    ]
    alerts = []
    for h in hits:
        alerts.append(
            RiskAlert(
                risk=h.card.one_line or h.card.title,
                from_card=h.card.id,
                from_title=h.card.title,
                severity=h.card.severity or "中",
            )
        )
    checklist = _dedup([item for h in hits for item in h.card.checklist])
    questions = [
        "这些历史失败的根因，在本方案里是否仍然存在？",
        "我们是不是只看到了收益，没有看到副作用？",
        "哪些边界条件 / 异常状态还没有想清楚？",
    ]
    return RiskReport(
        requirement=requirement,
        normalized=normalized,
        matched_failures=matched,
        risk_alerts=alerts,
        pre_launch_checklist=checklist,
        questions_to_think=questions,
        llm_used=False,
    )


def _assemble_report(
    requirement: str, normalized: dict, data: dict, hits: list[SearchHit]
) -> RiskReport:
    sim_by_id = {h.card.id: h.score for h in hits}
    title_by_id = {h.card.id: h.card.title for h in hits}

    matched = []
    for m in data.get("matched_failures", []) or []:
        cid = str(m.get("id", ""))
        matched.append(
            MatchedFailure(
                id=cid,
                title=m.get("title") or title_by_id.get(cid, ""),
                similarity=sim_by_id.get(cid, 0.0),
                why_relevant=m.get("why_relevant", ""),
            )
        )
    if not matched:
        matched = [
            MatchedFailure(id=h.card.id, title=h.card.title, similarity=h.score)
            for h in hits
        ]

    alerts = []
    for a in data.get("risk_alerts", []) or []:
        cid = str(a.get("from_card", ""))
        alerts.append(
            RiskAlert(
                risk=a.get("risk", ""),
                from_card=cid,
                from_title=title_by_id.get(cid, ""),
                severity=a.get("severity", ""),
            )
        )

    return RiskReport(
        requirement=requirement,
        normalized=normalized,
        matched_failures=matched,
        risk_alerts=alerts,
        pre_launch_checklist=_dedup(data.get("pre_launch_checklist", []) or []),
        questions_to_think=_dedup(data.get("questions_to_think", []) or []),
        llm_used=True,
    )


def risk_check(requirement: str, context: str = "", top_k: int = 5) -> RiskReport:
    normalized = _raw_normalized(requirement, context)
    query_text = normalized["query_text"]
    hits = semantic_search(query_text, top_k=top_k)

    if not hits:
        return RiskReport(
            requirement=requirement,
            normalized=normalized,
            matched_failures=[],
            risk_alerts=[],
            pre_launch_checklist=["失败博物馆暂无相关历史失败，建议补充录入后再次体检。"],
            questions_to_think=["这是一个全新领域吗？是否有相邻场景的失败可以借鉴？"],
            llm_used=False,
        )

    systemic = patterns_for_cards([h.card.id for h in hits])

    settings = get_settings()
    if settings.llm_enabled:
        try:
            normalized = _normalize(requirement, context)
            user = json.dumps(
                {
                    "requirement": requirement,
                    "context": context,
                    "normalized": normalized,
                    "historical_failures": _cards_payload(hits),
                },
                ensure_ascii=False,
            )
            data = chat_json(RISK_SYSTEM, user)
            report = _assemble_report(requirement, normalized, data, hits)
            report.systemic_patterns = systemic
            return report
        except Exception:
            pass
    report = _fallback_report(requirement, normalized, hits)
    report.systemic_patterns = systemic
    return report


def risk_check_events(
    requirement: str, context: str = "", top_k: int = 5
) -> Iterator[tuple[str, Any]]:
    """Streaming variant of :func:`risk_check`.

    Surfaces the no-LLM retrieval result (matched failures + systemic patterns)
    the instant search finishes, then runs a single LLM call for the report.
    Yields ``status`` / ``matched`` / ``done`` events for the SSE router.
    """
    normalized = _raw_normalized(requirement, context)
    query_text = normalized["query_text"]

    yield ("status", {"text": "正在检索相似的历史失败…"})
    hits = semantic_search(query_text, top_k=top_k)

    if not hits:
        yield (
            "done",
            RiskReport(
                requirement=requirement,
                normalized=normalized,
                matched_failures=[],
                risk_alerts=[],
                pre_launch_checklist=["失败博物馆暂无相关历史失败，建议补充录入后再次体检。"],
                questions_to_think=["这是一个全新领域吗？是否有相邻场景的失败可以借鉴？"],
                llm_used=False,
            ).model_dump(),
        )
        return

    systemic = patterns_for_cards([h.card.id for h in hits])

    # No-LLM preview: matched failures + systemic patterns are ready immediately.
    matched_preview = [
        MatchedFailure(
            id=h.card.id,
            title=h.card.title,
            similarity=h.score,
            why_relevant=h.card.one_line or "场景与关键动作相近",
        )
        for h in hits
    ]
    yield (
        "matched",
        {
            "matched_failures": [m.model_dump() for m in matched_preview],
            "systemic_patterns": [s.model_dump() for s in systemic],
        },
    )

    settings = get_settings()
    if settings.llm_enabled:
        yield ("status", {"text": "正在生成上线前风险体检报告…"})
        try:
            user = json.dumps(
                {
                    "requirement": requirement,
                    "context": context,
                    "normalized": normalized,
                    "historical_failures": _cards_payload(hits),
                },
                ensure_ascii=False,
            )
            data = chat_json(RISK_SYSTEM, user, max_tokens=REPORT_MAX_TOKENS)
            report = _assemble_report(requirement, normalized, data, hits)
            report.systemic_patterns = systemic
            yield ("done", report.model_dump())
            return
        except Exception:
            pass

    report = _fallback_report(requirement, normalized, hits)
    report.systemic_patterns = systemic
    yield ("done", report.model_dump())
