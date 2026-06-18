import hashlib
import json
import math
from collections import OrderedDict
from typing import Any

import jieba

from .config import get_settings


class LLMUnavailable(Exception):
    """Raised when a chat call is attempted without an API key configured."""


_chat_client = None
_embed_client = None
_embed_cache: OrderedDict[str, list[float]] = OrderedDict()
FALLBACK_DIM = 512
EMBED_CACHE_SIZE = 512


def _get_chat_client():
    global _chat_client
    if _chat_client is None:
        from openai import OpenAI

        s = get_settings()
        _chat_client = OpenAI(
            api_key=s.llm_api_key,
            base_url=s.llm_base_url,
            timeout=s.llm_timeout_seconds,
            max_retries=s.llm_max_retries,
        )
    return _chat_client


def _get_embed_client():
    global _embed_client
    if _embed_client is None:
        from openai import OpenAI

        s = get_settings()
        _embed_client = OpenAI(
            api_key=s.effective_embed_api_key,
            base_url=s.effective_embed_base_url,
            timeout=s.embed_timeout_seconds,
            max_retries=s.embed_max_retries,
        )
    return _embed_client


def _embed_cache_key(model: str, base_url: str, text: str) -> str:
    payload = f"{base_url}\n{model}\n{text}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _remember_embedding(key: str, embedding: list[float]) -> None:
    _embed_cache[key] = embedding
    _embed_cache.move_to_end(key)
    while len(_embed_cache) > EMBED_CACHE_SIZE:
        _embed_cache.popitem(last=False)


def _fallback_embed(text: str) -> list[float]:
    """Deterministic local embedding so the app runs without an API key.

    Hashes jieba tokens into a fixed-size signed bag-of-words vector. This gives
    lexical (not deep-semantic) similarity, enough for an offline UI demo.
    """
    vec = [0.0] * FALLBACK_DIM
    tokens = [t for t in jieba.cut(text) if t.strip()]
    for tok in tokens:
        h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
        idx = h % FALLBACK_DIM
        sign = 1.0 if (h // FALLBACK_DIM) % 2 == 0 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed_texts(texts: list[str]) -> list[list[float]]:
    s = get_settings()
    if not s.embed_enabled:
        return [_fallback_embed(t) for t in texts]

    results: list[list[float] | None] = [None] * len(texts)
    missing: list[tuple[int, str, str]] = []
    for i, text in enumerate(texts):
        key = _embed_cache_key(s.embed_model, s.effective_embed_base_url, text)
        cached = _embed_cache.get(key)
        if cached is not None:
            _embed_cache.move_to_end(key)
            results[i] = cached
        else:
            missing.append((i, key, text))

    if missing:
        client = _get_embed_client()
        try:
            resp = client.embeddings.create(
                model=s.embed_model,
                input=[text for _, _, text in missing],
            )
            embeddings = [d.embedding for d in resp.data]
            if len(embeddings) != len(missing):
                raise RuntimeError("embedding response length mismatch")
        except Exception:
            embeddings = [_fallback_embed(text) for _, _, text in missing]

        for (i, key, _), embedding in zip(missing, embeddings):
            results[i] = embedding
            _remember_embedding(key, embedding)

    return [r if r is not None else _fallback_embed(texts[i]) for i, r in enumerate(results)]


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]


def chat_json(system: str, user: str, temperature: float = 0.2) -> dict[str, Any]:
    """Call the chat model and parse a JSON object from the response."""
    s = get_settings()
    if not s.llm_enabled:
        raise LLMUnavailable("LLM API key not configured")
    client = _get_chat_client()
    resp = client.chat.completions.create(
        model=s.llm_chat_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
        temperature=temperature,
    )
    content = resp.choices[0].message.content or "{}"
    return _safe_json(content)


def chat_completion(
    messages: list[dict], tools: list[dict] | None = None, temperature: float = 0.2
):
    """Raw chat call that supports tool/function calling for the curator agent.

    Returns the assistant message object (with optional `.tool_calls`).
    """
    s = get_settings()
    if not s.llm_enabled:
        raise LLMUnavailable("LLM API key not configured")
    client = _get_chat_client()
    kwargs: dict[str, Any] = {
        "model": s.llm_chat_model,
        "messages": messages,
        "temperature": temperature,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"
    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message


def _safe_json(content: str) -> dict[str, Any]:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(content[start : end + 1])
        raise
