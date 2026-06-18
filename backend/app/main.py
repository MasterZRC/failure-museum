from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import cards, curator, graph, risk, search

app = FastAPI(
    title="Failure Museum API",
    description="Turn failures into a proactive, searchable pre-launch warning system.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cards.router)
app.include_router(search.router)
app.include_router(risk.router)
app.include_router(graph.router)
app.include_router(curator.router)


@app.get("/api/health")
def health() -> dict:
    s = get_settings()
    return {
        "status": "ok",
        "llm_enabled": s.llm_enabled,
        "embed_enabled": s.embed_enabled,
        "chat_model": s.llm_chat_model if s.llm_enabled else "(fallback)",
        "embed_model": s.embed_model if s.embed_enabled else "(local-fallback)",
    }
