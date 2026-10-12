"""Catalog, character sheets and subtitles bundled with the Lambda package."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"


@lru_cache(maxsize=1)
def catalog() -> list[dict]:
    return json.loads((DATA_DIR / "catalog.json").read_text())["items"]


def title(media_id: str | None) -> dict | None:
    return next((t for t in catalog() if t["id"] == media_id), None)


@lru_cache(maxsize=64)
def characters(media_id: str) -> list[dict]:
    path = DATA_DIR / "characters" / f"{media_id}.json"
    return json.loads(path.read_text())["characters"] if path.exists() else []


def characters_seen(media_id: str, position: float) -> list[dict]:
    """Characters already introduced at `position`, without later reveals."""
    out = []
    for c in characters(media_id):
        if c.get("firstSeen", 0) <= position:
            out.append({k: v for k, v in c.items() if k not in ("reveals",)})
            for reveal in c.get("reveals", []):
                if reveal["at"] <= position:
                    out[-1]["description"] += " " + reveal["text"]
    return out


_TS = re.compile(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)")


def _secs(h, m, s, ms) -> float:
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


@lru_cache(maxsize=64)
def subtitles(media_id: str) -> list[tuple[float, float, str]]:
    path = DATA_DIR / "subtitles" / f"{media_id}.srt"
    if not path.exists():
        return []
    cues = []
    for block in re.split(r"\n\s*\n", path.read_text(encoding="utf-8-sig").replace("\r", "")):
        lines = block.strip().split("\n")
        for i, line in enumerate(lines):
            m = _TS.search(line)
            if m:
                text = " ".join(lines[i + 1 :]).strip()
                text = re.sub(r"<[^>]+>", "", text)
                if text:
                    cues.append((_secs(*m.groups()[:4]), _secs(*m.groups()[4:]), text))
                break
    return cues


def subtitles_window(media_id: str, position: float, window: float = 300) -> list[str]:
    """Dialogue from (position - window) up to position. Never anything later."""
    return [
        f"[{int(start // 60)}:{int(start % 60):02d}] {text}"
        for start, _end, text in subtitles(media_id)
        if position - window <= start <= position
    ]
