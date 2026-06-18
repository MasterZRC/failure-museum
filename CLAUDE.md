# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Failure Museum is a local AI demo for turning retrospectives, chat logs, and incident records into structured “failure cards” that can be searched, clustered, cited in a curator chat, and matched against new requirements before launch.

The app is split into:

- `backend/`: FastAPI + Pydantic API, local JSON persistence, OpenAI-compatible chat/embedding client, semantic search, risk reports, graph clustering, and curator RAG/tool-calling logic.
- `frontend/`: Vite + React 18 + TypeScript + Tailwind UI with routes for gallery, graph, curator chat, risk check, ingest, and card details.
- `tools/`: utility scripts such as UTF-8 normalization for Chinese text files.

The repository currently has no dedicated unit test framework configured. Verification is mainly frontend TypeScript build plus the backend smoke test against a running API.

## Common commands

### Backend setup and run

Run backend commands from `backend/` so `.env` and the default `./data/cards.json` storage path resolve correctly.

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env
python -m app.seed_data --reset
uvicorn app.main:app --reload
```

Backend defaults:

- API: `http://127.0.0.1:8000`
- Swagger: `http://127.0.0.1:8000/docs`
- Health check: `GET /api/health`

Seed data commands:

```bash
cd backend
python -m app.seed_data          # add demo failure cards
python -m app.seed_data --reset  # clear local JSON store first
```

### Backend smoke test

Keep `uvicorn app.main:app --reload` running in another shell first.

```bash
cd backend
python smoke_test.py
```

This exercises health, stats, search, and risk-check endpoints and writes `backend/smoke_result.json`.

### Frontend setup and run

```bash
cd frontend
npm install
npm run dev
npm run build
npm run preview
```

Frontend dev server defaults to `http://localhost:5173`; Vite proxies `/api` to `http://127.0.0.1:8000`.

There is no `npm run lint` script in `frontend/package.json`.

### Run a focused check

No single-test command exists because no test runner is configured. Use the narrowest applicable command instead:

```bash
cd frontend && npm run build       # TypeScript + production bundle check
cd backend && python smoke_test.py # API smoke test, requires running backend
```

### Encoding normalization

If Windows tooling saves Chinese source/docs as UTF-16 or with BOM, normalize back to UTF-8:

```bash
python tools/to_utf8.py .
```

## Configuration and runtime behavior

Backend configuration is loaded by `backend/app/config.py` from environment variables or `backend/.env` via `pydantic-settings`.

Important settings from `backend/.env.example`:

- `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_CHAT_MODEL`: chat model for card extraction, requirement normalization, risk report generation, graph pattern naming, and curator answers.
- `EMBED_API_KEY`, `EMBED_BASE_URL`, `EMBED_MODEL`: embedding model for vectorization and semantic search. Empty embedding key/base URL falls back to `LLM_API_KEY`/`LLM_BASE_URL`.
- `STORAGE_FILE`: local JSON card store, default `./data/cards.json` relative to the backend working directory.

The app is intentionally demoable without API keys:

- Embeddings fall back to deterministic local jieba token hashing in `backend/app/llm.py`.
- Ingest, risk, graph naming, and curator responses have rule-based/retrieval-only fallbacks when chat is unavailable or fails.

## Backend architecture

`backend/app/main.py` constructs the FastAPI app, enables permissive CORS, mounts routers, and exposes `/api/health` with current LLM/embedding availability.

Core data flow:

1. `routers/` files are thin FastAPI adapters under `/api/*`.
2. `services/` hold business logic.
3. `schemas.py` defines the shared Pydantic response/request models.
4. `store.py` owns local JSON persistence, in-process cache, search text construction, and cosine ranking over persisted embeddings.
5. `llm.py` wraps OpenAI-compatible chat/embedding APIs plus local fallbacks.

Main service responsibilities:

- `services/ingest.py`: converts raw retrospective text to a `FailureCard` draft with the chat model or fallback; `save_card()` embeds `store.build_search_text(card)` and upserts into the JSON store.
- `services/search.py`: embeds the query, uses `store.query()`, and returns similarity-scored `SearchHit`s.
- `services/risk.py`: retrieves similar cards for a new requirement, optionally asks the chat model for relevance/risk/checklist/questions, and augments the report with graph-derived systemic patterns.
- `services/graph.py`: builds a kNN similarity graph from stored card embeddings, clusters with `networkx` greedy modularity, names clusters with LLM or fallback, memoizes by collection signature, and caches LLM pattern names to `data/patterns.json`.
- `services/curator.py`: implements a small tool-calling RAG loop over `search_failures`, `list_failure_patterns`, and `get_card`; without an LLM it returns a retrieval-only summary.

Persistence details:

- Cards and embeddings are stored together in `backend/data/cards.json` by default.
- Graph pattern names are cached in `backend/data/patterns.json` next to the storage file.
- `store.py` keeps an in-process `_records` cache; direct file edits will not be picked up until process restart or cache reset.

## Frontend architecture

`frontend/src/main.tsx` creates a React Router browser router. `frontend/src/App.tsx` provides the persistent shell, navigation, backend health badge, and nested route outlet.

Routes:

- `/`: gallery/search/stats view.
- `/graph`: force-directed failure graph and clustered patterns.
- `/curator`: curator chat UI backed by `/api/curator/chat`.
- `/risk`: pre-launch risk-check flow backed by `/api/risk-check`.
- `/ingest`: raw text → draft failure card → publish flow.
- `/card/:id`: card detail view.

`frontend/src/api.ts` is the API boundary and duplicates backend response shapes as TypeScript interfaces. When backend schemas change, update these types and the calling pages/components together.

Styling is Tailwind-based (`frontend/tailwind.config.js`, `frontend/src/index.css`) with dark museum-themed components. Graph rendering uses `react-force-graph-2d`; markdown rendering uses `react-markdown` and `remark-gfm`.

## API surface

Current backend endpoints:

- `GET /api/health`
- `GET /api/cards`
- `GET /api/cards/stats`
- `GET /api/cards/{id}`
- `POST /api/cards/ingest` creates a draft only; it does not persist.
- `POST /api/cards` persists a card and embedding.
- `PUT /api/cards/{id}` updates a card and rebuilds its embedding.
- `POST /api/search`
- `POST /api/risk-check`
- `GET /api/graph`
- `GET /api/graph/patterns`
- `POST /api/curator/chat`

## Failure card model

`FailureCard` in `backend/app/schemas.py` is the atomic knowledge unit. Key fields include title, one-line lesson, scenario, tags, tech domains, severity, context, what happened, mechanism-level root cause, impact, warning signals, checklist, resolution, owner team, and source type.

The seed data and ingest prompt follow two product constraints that matter when editing prompts or examples:

- Root causes should describe mechanisms/processes/technical boundaries rather than blaming individuals.
- Warning signals and checklist items should be observable/actionable before or during the next launch.
