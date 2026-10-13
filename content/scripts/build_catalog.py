"""Resolve titles.json into catalog.json using the Internet Archive metadata API.

    python3 content/scripts/build_catalog.py            # writes content/catalog.json
    python3 content/scripts/build_catalog.py --sync     # ...and copies it to backend + app

Pass --media-base https://<cloudfront>/media to point mp4/poster URLs at our own
CDN after scripts/upload_content.py has mirrored them.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
TARGETS = [
    ROOT / "backend/src/couchlink/data/catalog.json",
    ROOT / "app/packages/shared-ui/src/data/catalog.json",
]
VIDEO_FORMATS = {"h.264", "MPEG4", "h.264 IA", "512Kb MPEG4"}


def fetch_meta(archive_id: str) -> dict:
    url = f"https://archive.org/metadata/{urllib.parse.quote(archive_id)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(2 * 2**attempt)
    raise RuntimeError("unreachable")


def length_secs(v) -> float:
    if v is None:
        return 0.0
    v = str(v)
    if ":" in v:
        parts = [float(p) for p in v.split(":")]
        return sum(p * 60**i for i, p in enumerate(reversed(parts)))
    return float(v)


def is_faststart(url: str) -> bool:
    """True if the MP4 index (moov) is at the front, so playback can start immediately."""
    req = urllib.request.Request(url, headers={"Range": "bytes=0-65535", "User-Agent": "couchlink-catalog"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            head = r.read(65536)
    except Exception:  # noqa: BLE001
        return False
    moov, mdat = head.find(b"moov"), head.find(b"mdat")
    return moov != -1 and (mdat == -1 or moov < mdat)


def pick_video(files: list[dict], archive_id: str) -> tuple[dict | None, bool]:
    vids = [f for f in files if f["name"].lower().endswith(".mp4") and f.get("format") in VIDEO_FORMATS]

    def rank(f):
        h = int(f.get("height") or 0)
        low = "512kb" in f["name"].lower()
        # Prefer full-quality <=720p, then anything full-quality, then 512kb.
        return (not low, h <= 720 and h > 0, h)

    ordered = sorted(vids, key=rank, reverse=True)
    for f in ordered:
        if is_faststart(file_url(archive_id, f["name"])):
            return f, True
    return (ordered[0], False) if ordered else (None, False)


def pick_poster(files: list[dict], archive_id: str) -> str:
    jpgs = [f for f in files if f["name"].lower().endswith((".jpg", ".png")) and f.get("format") in ("JPEG", "PNG")]
    for f in jpgs:
        if "poster" in f["name"].lower():
            return f["name"]
    if jpgs:
        return max(jpgs, key=lambda f: int(f.get("size") or 0))["name"]
    return ""


def file_url(archive_id: str, name: str) -> str:
    return f"https://archive.org/download/{archive_id}/{urllib.parse.quote(name)}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sync", action="store_true")
    ap.add_argument("--media-base", default="")
    a = ap.parse_args()

    titles = json.loads((CONTENT / "titles.json").read_text())["titles"]
    previous = {}
    if (CONTENT / "catalog.json").exists():
        previous = {i["id"]: i for i in json.loads((CONTENT / "catalog.json").read_text())["items"]}
    items, problems = [], []
    for t in titles:
        time.sleep(1)  # be gentle with archive.org
        try:
            meta = fetch_meta(t["archiveId"])
        except Exception as e:  # noqa: BLE001
            if t["id"] in previous:
                # Keep last known-good entry, refreshed with editorial fields.
                items.append({**previous[t["id"]], **{k: v for k, v in t.items() if k != "archiveId"}})
                problems.append(f"{t['id']}: metadata fetch failed ({e}); kept previous entry")
            else:
                problems.append(f"{t['id']}: metadata fetch failed ({e}); SKIPPED")
            continue
        files = meta.get("files", [])
        video, fast = pick_video(files, t["archiveId"])
        if not video:
            problems.append(f"{t['id']}: no mp4 in {t['archiveId']}")
            continue
        poster = pick_poster(files, t["archiveId"])
        subs = [f["name"] for f in files if f["name"].lower().endswith(".srt") and (".en." in f["name"].lower() or "asr" not in f["name"].lower())]
        item = {k: v for k, v in t.items() if k not in ("archiveId",)}
        if a.media_base:
            item["videoUrl"] = f"{a.media_base}/{t['id']}.mp4"
            item["posterUrl"] = f"{a.media_base}/{t['id']}.jpg"
        else:
            item["videoUrl"] = file_url(t["archiveId"], video["name"])
            item["posterUrl"] = file_url(t["archiveId"], poster) if poster else f"https://archive.org/services/img/{t['archiveId']}"
        item["durationSec"] = round(length_secs(video.get("length")))
        item["source"] = f"https://archive.org/details/{t['archiveId']}"
        item["sourceVideo"] = file_url(t["archiveId"], video["name"])
        if subs:
            item["sourceSubtitles"] = file_url(t["archiveId"], subs[0])
        item["hero"] = bool(t.get("hero"))
        items.append(item)
        item["faststart"] = fast
        print(f"ok  {t['id']:28} {item['durationSec']:>5}s  {video['name'][:40]:40} {video.get('height')}p fast={fast} poster={bool(poster)}")
        if not fast:
            problems.append(f"{t['id']}: no faststart mp4; mirror + transcode it (scripts/mirror_media.sh)")

    out = {"version": 1, "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "items": items}
    (CONTENT / "catalog.json").write_text(json.dumps(out, indent=2) + "\n")
    print(f"\nwrote {len(items)} titles to content/catalog.json")
    if problems:
        print("PROBLEMS:\n  " + "\n  ".join(problems), file=sys.stderr)
    if a.sync:
        for target in TARGETS:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(CONTENT / "catalog.json", target)
            print(f"synced -> {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
