"""Drive a CouchLink session so a TV logs its sync drift: start, seek, pause/resume.

Join an existing session as a second viewer, load a title, and walk through three phases.
The TV under test logs `[couchlink] drift ms median=.. p90=.. signed=.. n=..` every 10 s
while playing (signed < 0 means that TV is behind the shared timeline). On Vega, read it with:

    vda shell 'loggingctl log -f -v com.giolaq.multitv.vega' | grep '\\[couchlink\\]'

Usage: uv run python scripts/drift_run.py <code> [--url wss://.../prod] [--media sintel]
"""

import argparse
import asyncio
import json
import time

import aiohttp


def log(msg: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {msg}", flush=True)


async def run(url: str, code: str, media: str, steady: int, after: int) -> None:
    async with aiohttp.ClientSession() as http, http.ws_connect(url) as ws:

        async def drain() -> None:
            async for m in ws:
                d = json.loads(m.data)
                if d.get("type") == "error":
                    log(f"<- error {d.get('code')}: {d.get('message')}")

        reader = asyncio.create_task(drain())

        async def cmd(action: str, **kw) -> None:
            log(f"-> {action} {kw or ''}")
            await ws.send_str(json.dumps({"type": "cmd", "action": action, **kw}))

        await ws.send_str(json.dumps({"type": "join", "code": code, "name": "DriftRun"}))
        await asyncio.sleep(3)
        await cmd("load", mediaId=media)
        log(f"phase 1: synced start, {steady} s")
        await asyncio.sleep(steady)
        await cmd("seek", position=420.0)
        log(f"phase 2: after a seek, {after} s")
        await asyncio.sleep(after)
        await cmd("pause")
        await asyncio.sleep(5)
        await cmd("play")
        log(f"phase 3: after pause/resume, {after} s")
        await asyncio.sleep(after)
        await cmd("pause")
        reader.cancel()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("code", help="6-digit session code shown on the TV under test")
    p.add_argument("--url", default="ws://localhost:8787/ws")
    p.add_argument("--media", default="sintel")
    p.add_argument("--steady", type=int, default=130, help="seconds of playback after the synced start")
    p.add_argument("--after", type=int, default=60, help="seconds of playback after the seek and after resume")
    a = p.parse_args()
    asyncio.run(run(a.url, a.code, a.media, a.steady, a.after))


if __name__ == "__main__":
    main()
