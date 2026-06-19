"""Durable JSON persistence on Vercel Blob.

Vercel serverless functions run on an ephemeral filesystem (only ``/tmp`` is
writable, and it is wiped between instances). To make card data and the graph
caches survive cold starts, we persist small JSON documents to a linked Vercel
Blob store under stable pathnames (no random suffix).

This module is only active when ``BLOB_READ_WRITE_TOKEN`` is present (injected by
Vercel when a Blob store is linked, or pulled locally via ``vercel env pull``).
When the token is absent, callers transparently fall back to local-file storage,
so the local dev flow is unchanged.

The actual content GET uses the public blob URL via ``urllib`` so we do not
depend on a specific SDK download signature; uploads and listing go through the
official ``vercel`` SDK ``BlobClient``.
"""
from __future__ import annotations

import json
import os
import urllib.request
from typing import Any


def blob_enabled() -> bool:
    """True when a Vercel Blob store is configured for this process."""
    return bool(os.environ.get("BLOB_READ_WRITE_TOKEN"))


def _client():
    # Imported lazily so the dependency is only required when Blob is actually used.
    from vercel.blob import BlobClient

    return BlobClient()


def _iter_blobs(listing: Any):
    """Yield blob entries from a listing across possible SDK return shapes."""
    blobs = getattr(listing, "blobs", None)
    if blobs is None and isinstance(listing, dict):
        blobs = listing.get("blobs")
    if blobs is None and isinstance(listing, (list, tuple)):
        blobs = listing
    return blobs or []


def _attr(obj: Any, name: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


def _find_url(listing: Any, pathname: str) -> str | None:
    for blob in _iter_blobs(listing):
        if _attr(blob, "pathname") == pathname:
            url = _attr(blob, "url") or _attr(blob, "downloadUrl")
            if url:
                return str(url)
    return None


def read_json(pathname: str) -> dict[str, Any] | None:
    """Return the parsed JSON stored at *pathname*, or ``None`` if missing/unreadable."""
    if not blob_enabled():
        return None
    try:
        with _client() as client:
            listing = client.list_objects(prefix=pathname)
            url = _find_url(listing, pathname)
        if not url:
            return None
        with urllib.request.urlopen(url, timeout=10) as resp:  # noqa: S310 (trusted blob URL)
            raw = resp.read().decode("utf-8")
        return json.loads(raw)
    except Exception:
        return None


def _put(client: Any, pathname: str, body: bytes) -> None:
    """Upload *body* to *pathname*, overwriting any existing blob.

    Newer Vercel Blob requires opting into overwrite; older signatures may not
    accept those kwargs, so we degrade gracefully and, as a last resort, delete
    then re-upload.
    """
    try:
        client.put(
            pathname,
            body,
            access="public",
            content_type="application/json",
            add_random_suffix=False,
            allow_overwrite=True,
        )
        return
    except TypeError:
        # SDK signature without overwrite kwargs.
        pass
    try:
        client.put(pathname, body, access="public", content_type="application/json")
        return
    except Exception:
        # Blob may already exist and overwrite is disallowed: delete then re-put.
        listing = client.list_objects(prefix=pathname)
        url = _find_url(listing, pathname)
        if url:
            try:
                client.delete([url])
            except Exception:
                pass
        client.put(pathname, body, access="public", content_type="application/json")


def write_json(pathname: str, obj: Any) -> bool:
    """Persist *obj* as JSON at *pathname*. Returns True on success."""
    if not blob_enabled():
        return False
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    try:
        with _client() as client:
            _put(client, pathname, body)
        return True
    except Exception:
        return False
