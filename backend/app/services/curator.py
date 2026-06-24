"""The Curator: an agentic RAG persona that answers questions about the museum.

It runs a small tool-calling loop over the failure collection:
  * search_failures        -> semantic retrieval
  * list_failure_patterns  -> the clustered organization-level failure patterns
  * get_card               -> full detail of one card

Every answer must cite the failure cards it relied on. Without an API key it
degrades to a retrieval-only summary so the page still works in the demo.
"""
from __future__ import annotations

import json
from typing import Any, Iterator

from .. import store
from ..config import get_settings
from ..llm import chat_completion, chat_stream
from ..schemas import CuratorChatResponse, CuratorMessage
from .graph import list_patterns
from .search import semantic_search

MAX_ITERS = 2
ANSWER_MAX_TOKENS = 800

CURATOR_SYSTEM = """你是"失败博物馆"的馆长。你的职责是基于馆藏的"失败卡"，帮助团队复用历史失败、避免重蹈覆辙。

工作方式：
1. 先用工具检索 / 查阅馆藏，再回答；不要凭空臆造馆里没有的失败。
2. 回答时引用具体失败卡：在句子里用「卡片标题」并保留其 id（形如 fc_seed_002）。
3. 优先指出"反复出现的失败模式"和"机制层面的根因"，给出可执行的防御建议。
4. 语气像一位见过很多事故、克制而中肯的资深馆长。全部使用简体中文，回答简洁有重点。
5. 若馆藏中确实没有相关失败，如实说明，并建议补充录入。"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_failures",
            "description": "按语义检索馆藏失败卡，返回最相关的若干条（含 id / 标题 / 一句话教训 / 根因）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "检索语句"},
                    "top_k": {"type": "integer", "description": "返回数量，默认 5"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_failure_patterns",
            "description": "列出已聚类的组织级失败模式（含出现次数、涉及领域、防御原则、成员卡片 id）。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_card",
            "description": "按 id 获取某张失败卡的完整内容。",
            "parameters": {
                "type": "object",
                "properties": {"id": {"type": "string"}},
                "required": ["id"],
            },
        },
    },
]


def _tool_search(args: dict, cited: list[str]) -> tuple[str, str]:
    query = str(args.get("query", "")).strip()
    top_k = int(args.get("top_k", 5) or 5)
    hits = semantic_search(query, top_k=top_k)
    for h in hits:
        if h.card.id not in cited:
            cited.append(h.card.id)
    payload = [
        {
            "id": h.card.id,
            "title": h.card.title,
            "one_line": h.card.one_line,
            "scenario": h.card.scenario,
            "root_cause": h.card.root_cause,
            "checklist": h.card.checklist,
            "similarity": h.score,
        }
        for h in hits
    ]
    return json.dumps(payload, ensure_ascii=False), f"检索「{query}」，命中 {len(hits)} 条"


def _tool_patterns(_: dict) -> tuple[str, str]:
    patterns = list_patterns()
    payload = [
        {
            "id": p.id,
            "name": p.name,
            "principle": p.principle,
            "systemic_risk": p.systemic_risk,
            "count": p.count,
            "domains": p.domains,
            "member_ids": p.member_ids,
        }
        for p in patterns
    ]
    return json.dumps(payload, ensure_ascii=False), f"查阅失败模式，共 {len(patterns)} 类"


def _tool_get_card(args: dict, cited: list[str]) -> tuple[str, str]:
    cid = str(args.get("id", "")).strip()
    card = store.get_card(cid)
    if card is None:
        return json.dumps({"error": "not found", "id": cid}, ensure_ascii=False), f"翻阅卡片 {cid}（未找到）"
    if cid not in cited:
        cited.append(cid)
    return card.model_dump_json(), f"翻阅卡片「{card.title}」"


def _run_tool(name: str, args: dict, cited: list[str]) -> tuple[str, str]:
    if name == "search_failures":
        return _tool_search(args, cited)
    if name == "list_failure_patterns":
        return _tool_patterns(args)
    if name == "get_card":
        return _tool_get_card(args, cited)
    return json.dumps({"error": f"unknown tool {name}"}, ensure_ascii=False), f"未知工具 {name}"


def _serialize_assistant(msg) -> dict:
    return {
        "role": "assistant",
        "content": msg.content or "",
        "tool_calls": [
            {
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                },
            }
            for tc in (msg.tool_calls or [])
        ],
    }


def _last_user(messages: list[CuratorMessage]) -> str:
    for m in reversed(messages):
        if m.role == "user":
            return m.content
    return ""


def _fallback(messages: list[CuratorMessage]) -> CuratorChatResponse:
    question = _last_user(messages)
    hits = semantic_search(question, top_k=4)
    if not hits:
        return CuratorChatResponse(
            answer="馆藏里暂时没有与该问题相关的失败记录，建议先把相关复盘录入失败博物馆，我便能为你检索复用。",
            cited_card_ids=[],
            tool_trace=["检索（降级模式）：未命中"],
            llm_used=False,
        )
    lines = ["（降级模式：未配置 AI Key，以下为基于语义检索的馆藏摘要）", ""]
    for h in hits:
        lines.append(f"· 「{h.card.title}」（{h.card.id}）—— {h.card.one_line}")
        if h.card.root_cause:
            lines.append(f"  根因：{h.card.root_cause}")
    lines.append("")
    lines.append("建议对照上述失败卡的「防坑清单」逐项检查。")
    return CuratorChatResponse(
        answer="\n".join(lines),
        cited_card_ids=[h.card.id for h in hits],
        tool_trace=[f"检索（降级模式）：命中 {len(hits)} 条"],
        llm_used=False,
    )


def chat(messages: list[CuratorMessage]) -> CuratorChatResponse:
    settings = get_settings()
    if not settings.llm_enabled:
        return _fallback(messages)

    convo: list[dict] = [{"role": "system", "content": CURATOR_SYSTEM}]
    for m in messages:
        role = m.role if m.role in ("user", "assistant") else "user"
        convo.append({"role": role, "content": m.content})

    cited: list[str] = []
    trace: list[str] = []

    try:
        for _ in range(MAX_ITERS):
            msg = chat_completion(convo, tools=TOOLS)
            if not getattr(msg, "tool_calls", None):
                return CuratorChatResponse(
                    answer=msg.content or "",
                    cited_card_ids=cited[:8],
                    tool_trace=trace,
                    llm_used=True,
                )
            convo.append(_serialize_assistant(msg))
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                result, label = _run_tool(tc.function.name, args, cited)
                trace.append(label)
                convo.append(
                    {"role": "tool", "tool_call_id": tc.id, "content": result}
                )
        # exhausted iterations: ask for a final answer without tools
        convo.append(
            {"role": "user", "content": "请基于以上检索到的资料，直接给出最终回答。"}
        )
        final = chat_completion(convo)
        return CuratorChatResponse(
            answer=final.content or "",
            cited_card_ids=cited[:8],
            tool_trace=trace,
            llm_used=True,
        )
    except Exception:
        return _fallback(messages)


def chat_events(messages: list[CuratorMessage]) -> Iterator[tuple[str, Any]]:
    """Streaming variant of :func:`chat`.

    Yields ``(event, data)`` tuples consumed by the SSE router:
      * ``status``: human-readable progress (thinking / each tool call)
      * ``token``:  a live delta of the final answer
      * ``done``:   the full ``CuratorChatResponse`` payload
    """
    settings = get_settings()
    if not settings.llm_enabled:
        yield ("done", _fallback(messages).model_dump())
        return

    convo: list[dict] = [{"role": "system", "content": CURATOR_SYSTEM}]
    for m in messages:
        role = m.role if m.role in ("user", "assistant") else "user"
        convo.append({"role": role, "content": m.content})

    cited: list[str] = []
    trace: list[str] = []

    try:
        yield ("status", {"text": "馆长正在思考…"})
        for _ in range(MAX_ITERS):
            assembled = None
            for kind, data in chat_stream(
                convo, tools=TOOLS, max_tokens=ANSWER_MAX_TOKENS
            ):
                if kind == "token":
                    yield ("token", {"text": data})
                else:
                    assembled = data

            if assembled is None or not getattr(assembled, "tool_calls", None):
                # No tool calls -> this turn IS the (already streamed) answer.
                yield (
                    "done",
                    {
                        "answer": assembled.content if assembled else "",
                        "cited_card_ids": cited[:8],
                        "tool_trace": trace,
                        "llm_used": True,
                    },
                )
                return

            convo.append(_serialize_assistant(assembled))
            for tc in assembled.tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                result, label = _run_tool(tc.function.name, args, cited)
                trace.append(label)
                yield ("status", {"text": label})
                convo.append(
                    {"role": "tool", "tool_call_id": tc.id, "content": result}
                )

        # Exhausted tool iterations: ask for a final answer without tools.
        convo.append(
            {"role": "user", "content": "请基于以上检索到的资料，直接给出最终回答。"}
        )
        yield ("status", {"text": "馆长正在总结…"})
        assembled = None
        for kind, data in chat_stream(convo, max_tokens=ANSWER_MAX_TOKENS):
            if kind == "token":
                yield ("token", {"text": data})
            else:
                assembled = data
        yield (
            "done",
            {
                "answer": assembled.content if assembled else "",
                "cited_card_ids": cited[:8],
                "tool_trace": trace,
                "llm_used": True,
            },
        )
    except Exception:
        yield ("done", _fallback(messages).model_dump())
