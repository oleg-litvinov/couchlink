"""Mirror catalog media to our own S3 + CloudFront, demo-ready.

For each title: download the source MP4, transcode to 720p H.264/AAC with
`+faststart` (index at the front -> instant start and fast seeks, which sync
depends on), grab a 16:9 poster frame, and upload to s3://<bucket>/media/.
Also fetches English subtitles for hero titles into the backend data dir.

Requires: ffmpeg, aws CLI with credentials. Uses ~6 GB of temporary disk.

    python3 content/scripts/mirror_media.py --bucket <WebBucketName> [--only sintel,tears-of-steel]
    python3 content/scripts/build_catalog.py --sync --media-base https://<cdn>/media
"""

import argparse
import json
import shutil
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "content" / ".media-cache"
SUBS_DIR = ROOT / "backend" / "src" / "couchlink" / "data" / "subtitles"


def run(*cmd: str) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True)


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    tmp = dest.with_suffix(dest.suffix + ".part")
    run("curl", "-L", "--fail", "--retry", "5", "-C", "-", "-o", str(tmp), url)
    tmp.rename(dest)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--keep-cache", action="store_true")
    a = ap.parse_args()

    for tool in ("ffmpeg", "aws", "curl"):
        if not shutil.which(tool):
            raise SystemExit(f"missing {tool}")

    catalog = json.loads((ROOT / "content" / "catalog.json").read_text())["items"]
    titles = {t["id"]: t for t in json.loads((ROOT / "content" / "titles.json").read_text())["titles"]}
    only = set(filter(None, a.only.split(",")))
    WORK.mkdir(exist_ok=True)
    SUBS_DIR.mkdir(parents=True, exist_ok=True)

    for item in catalog:
        tid = item["id"]
        if only and tid not in only:
            continue
        src = WORK / f"{tid}.src.mp4"
        out = WORK / f"{tid}.mp4"
        poster = WORK / f"{tid}.jpg"
        download(item["sourceVideo"], src)
        if not out.exists():
            run(
                "ffmpeg", "-y", "-i", str(src),
                "-vf", "scale=-2:720", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-profile:v", "high", "-pix_fmt", "yuv420p", "-g", "48",
                "-c:a", "aac", "-b:a", "128k", "-ac", "2",
                "-movflags", "+faststart", str(out),
            )
        if not poster.exists():
            at = max(5, int(item["durationSec"] * 0.12))
            run("ffmpeg", "-y", "-ss", str(at), "-i", str(out), "-frames:v", "1",
                "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720", "-q:v", "3", str(poster))
        run("aws", "s3", "cp", str(out), f"s3://{a.bucket}/media/{tid}.mp4",
            "--content-type", "video/mp4", "--cache-control", "public,max-age=31536000")
        run("aws", "s3", "cp", str(poster), f"s3://{a.bucket}/media/{tid}.jpg",
            "--content-type", "image/jpeg", "--cache-control", "public,max-age=86400")

        subs_url = titles.get(tid, {}).get("subtitlesUrl") or item.get("sourceSubtitles")
        if subs_url and item.get("hero"):
            download(subs_url, SUBS_DIR / f"{tid}.srt")
        if not a.keep_cache:
            src.unlink(missing_ok=True)

    print("\nDone. Now run:\n  python3 content/scripts/build_catalog.py --sync --media-base https://<CdnUrl>/media")


if __name__ == "__main__":
    main()
