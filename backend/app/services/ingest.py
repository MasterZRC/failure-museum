import uuid
from datetime import datetime

from .. import store
from ..llm import LLMUnavailable, chat_json, embed_text
from ..config import get_settings
from ..schemas import FailureCard

INGEST_SYSTEM = """你是"失败博物馆"的失败经验结构化助手。请把用户提供的非结构化失败描述（复盘、群聊、事故记录等）整理成一张结构化"失败卡"，并以 JSON 对象输出。

要求：
1. 只输出 JSON 对象，不要任何多余文字或解释。
2. 根因(root_cause)必须落到机制/流程/技术层面，禁止指向或责备具体个人；若出现人名，请脱敏为角色（如"开发""运营""产品"）。
3. warning_signals 写早期可被观察或监控到的征兆。
4. checklist 写成下一个项目可直接对照执行的检查项。
5. 信息缺失的字段用空字符串或空数组，不要编造。
6. 全部使用简体中文。

输出 JSON 字段：
{
 "title": "简短失败标题",
 "one_line": "一句话教训",
 "scenario": "业务场景，如 增长/激励活动、支付、推荐、AI功能、技术架构、发布、需求评审、稳定性 等",
 "tags": ["失败模式标签，如 防刷、接口幂等、成本控制、指标误判 等"],
 "tech_domains": ["涉及技术域，如 支付、账户、营销系统、推荐系统 等"],
 "severity": "影响级别，P0/P1/P2/P3 之一，未知留空",
 "happened_at": "发生日期 YYYY-MM-DD，未知留空",
 "context": "项目背景",
 "what_happened": "失败经过",
 "root_cause": "根因（机制层面）",
 "impact": "影响（成本/用户/指标）",
 "warning_signals": ["预警信号"],
 "checklist": ["防坑清单"],
 "resolution": "当时如何解决",
 "owner_team": "所属团队（可留空）"
}"""

_LIST_FIELDS = ("tags", "tech_domains", "warning_signals", "checklist")
_STR_FIELDS = (
    "title",
    "one_line",
    "scenario",
    "severity",
    "happened_at",
    "context",
    "what_happened",
    "root_cause",
    "impact",
    "resolution",
    "owner_team",
)


def _gen_id() -> str:
    return f"fc_{datetime.now():%Y%m%d}_{uuid.uuid4().hex[:8]}"


def _coerce_card(data: dict) -> FailureCard:
    payload: dict = {}
    for f in _STR_FIELDS:
        val = data.get(f, "")
        payload[f] = "" if val is None else str(val)
    for f in _LIST_FIELDS:
        val = data.get(f, [])
        if isinstance(val, str):
            val = [val] if val.strip() else []
        elif not isinstance(val, list):
            val = []
        payload[f] = [str(x) for x in val if str(x).strip()]
    return FailureCard(**payload)


def _fallback_card(raw_text: str) -> FailureCard:
    """Rule-based extraction used when no LLM key is configured."""
    text = raw_text.strip()
    first_line = text.splitlines()[0].strip() if text else "未命名失败"
    title = first_line[:40] if first_line else "未命名失败"
    return FailureCard(
        title=title,
        one_line=first_line[:60],
        scenario="未分类",
        what_happened=text,
        root_cause="（未配置 LLM，自动抽取受限，请人工补充根因）",
    )


def structure_card(raw_text: str, source_type: str = "pasted-text") -> FailureCard:
    """Turn raw failure text into a (not yet stored) FailureCard draft."""
    settings = get_settings()
    card: FailureCard
    if settings.llm_enabled:
        try:
            data = chat_json(INGEST_SYSTEM, raw_text)
            card = _coerce_card(data)
        except (LLMUnavailable, Exception):
            card = _fallback_card(raw_text)
    else:
        card = _fallback_card(raw_text)

    card.source_type = source_type
    card.anonymized = True
    if not card.id:
        card.id = _gen_id()
    return card


def save_card(card: FailureCard) -> FailureCard:
    """Persist a card: build search text, embed, and upsert into the store."""
    if not card.id:
        card.id = _gen_id()
    text = store.build_search_text(card)
    embedding = embed_text(text)
    store.add_card(card, embedding)
    return card


def ingest_and_store(raw_text: str, source_type: str = "pasted-text") -> FailureCard:
    return save_card(structure_card(raw_text, source_type))
