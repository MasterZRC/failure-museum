"""Durable JSON persistence on Vercel Blob.

Vercel serverless functions run on an ephemeral filesystem (only ``/tmp`` is
writable, and it is wiped between instances). To make card data and the graph
caches survive cold starts, we persist small JSON documents to a linked Vercel
Blob store under stable pathnames (no random suffix).

This module is only active when ``BLOB_READ_WRITE_TOKEN`` is present (injected by
Vercel when a Blob store is linked, or pulled locally via ``vercel env pull``).
When the token is absent, callers transparently fall back to local-file storage,
so the local dev flow is unchanged.

All I/O goes through the official ``vercel`` SDK ``BlobClient``, which reads its
token from ``BLOB_READ_WRITE_TOKEN`` and handles authenticated downloads for
private stores (a plain HTTP GET on a private blob URL would 401). The blob
store may be public or private; we auto-detect which ``access`` mode works and
remember it.
"""
from __future__ import annotations

import json
import os
from typing import Any

# Remembered access mode once we learn which one the store accepts.
_pref_access: str | None = None


def blob_enabled() -> bool:
    """True when a Vercel Blob store is configured for this process."""
    return bool(os.environ.get("BLOB_READ_WRITE_TOKEN"))


def _client():
    # Imported lazily so the dependency is only required when Blob is actually used.
    from vercel.blob import BlobClient

    return BlobClient()


def _access_candidates() -> list[str]:
    if _pref_access is not None:
        return [_pref_access]
    # Our linked store is Private; try that first, then fall back to public so
    # the same code works against a public store in local dev.
    return ["private", "public"]


def read_json(pathname: str) -> dict[str, Any] | None:
    """Return the parsed JSON stored at *pathname*, or ``None`` if missing/unreadable."""
    global _pref_access
    if not blob_enabled():
        return None

    from vercel.blob import BlobNotFoundError

    try:
        with _client() as client:
            for access in _access_candidates():
                try:
                    result = client.get(pathname, access=access, use_cache=False)
                except BlobNotFoundError:
                    _pref_access = access
                    return None
                except Exception:
                    continue
                _pref_access = access
                content = getattr(result, "content", None)
                if content is None:
                    return None
                return json.loads(content.decode("utf-8"))
    except Exception:
        return None
    return None


def write_json(pathname: str, obj: Any) -> bool:
    """Persist *obj* as JSON at *pathname*. Returns True on success."""
    global _pref_access
    if not blob_enabled():
        return False

    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    try:
        with _client() as client:
            last_err: Exception | None = None
            for access in _access_candidates():
                try:
                    client.put(
                        pathname,
                        body,
                        access=access,
                        content_type="application/json",
                        add_random_suffix=False,
                        overwrite=True,
                    )
                    _pref_access = access
                    return True
                except Exception as err:  # try the other access mode
                    last_err = err
                    continue
            if last_err is not None:
                raise last_err
        return False
    except Exception:
        return False
