"""Normalize source files to UTF-8.

The editor occasionally saves files that contain CJK text as UTF-16. Python and
most tooling expect UTF-8, so this script rewrites any UTF-16 / BOM-prefixed
file under the given roots back to plain UTF-8 (no BOM).

Usage:  python tools/to_utf8.py [root ...]
"""
import sys
from pathlib import Path

EXTS = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".html", ".txt", ".example"}
SKIP_DIRS = {"node_modules", ".git", "__pycache__", "data", "dist", ".venv", "venv"}


def detect_and_decode(raw: bytes) -> str | None:
    if raw.startswith(b"\xff\xfe"):
        return raw.decode("utf-16-le")
    if raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16-be")
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig")
    # Heuristic: lots of interleaved NULs => UTF-16LE without BOM.
    if len(raw) >= 2 and raw[1] == 0 and raw[0] != 0:
        try:
            return raw.decode("utf-16-le")
        except UnicodeDecodeError:
            return None
    return None


def convert_file(path: Path) -> bool:
    raw = path.read_bytes()
    text = detect_and_decode(raw)
    if text is None:
        return False
    path.write_text(text, encoding="utf-8", newline="\n")
    return True


def main(argv: list[str]) -> int:
    roots = [Path(a) for a in argv[1:]] or [Path(".")]
    changed = 0
    for root in roots:
        if root.is_file():
            files = [root]
        else:
            files = [p for p in root.rglob("*") if p.is_file()]
        for p in files:
            if p.suffix.lower() not in EXTS:
                continue
            if any(part in SKIP_DIRS for part in p.parts):
                continue
            try:
                if convert_file(p):
                    changed += 1
                    print(f"converted: {p}")
            except Exception as exc:  # noqa: BLE001
                print(f"skip {p}: {exc}")
    print(f"done, {changed} file(s) converted to UTF-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
