"""Vercel serverless entry point for the Failure Museum FastAPI backend.

Vercel's Python runtime looks for a module-level ASGI ``app`` object. We add the
``backend`` directory to ``sys.path`` so the existing ``app`` package imports
unchanged, then re-export the FastAPI instance.
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402

__all__ = ["app"]
