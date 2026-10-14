"""Measure sync quality of a deployed (or local) CouchLink session service.

Opens two WebSocket clients ("A" and "B") on this machine, joins them to one
session and measures:

- RTT and clock-offset estimate per client (same NTP-style method as the TV app)
- command fan-out: A sends play/pause/seek, time until A and B receive the new state
- clock agreement: |offset_A - offset_B|. Both clients share this machine's clock,
  so any difference is pure estimation error, which is the floor on TV-to-TV drift.

    uv run python scripts/sync_bench.py --url wss://xskpgmfq98.execute-api.us-east-2.amazonaws.com/prod
    uv run python scripts/sync_bench.py --url ws://localhost:8787/ws --rounds 50

Media-player drift on real devices is measured in the app (SyncBadge / driftStats).
"""

import argparse
import asyncio
import json
import statistics
import time

import aiohttp

PINGS = 8


def now_ms() -> float:
    return time.time() * 1000


def pct(values: list[float], p: float) -> float:
    s = sorted(values)
    return s[min(len(s) - 1, int(len(s) * p))]


class Client:
    def __init__(self, ws: aiohttp.ClientWebSocketResponse, name: str) -> None:
        self.ws = ws
        self.name = name
        self.inbox: asyncio.Queue = asyncio.Queue()
        self.samples: list[tuple[float, float]] = []  # (rtt, offset)
        self.reader = asyncio.create_task(self._read())

    async def _read(self) -> None:
        async for m in self.ws:
            msg = json.loads(m.data)
            msg["_rx"] = now_ms()
            if msg["type"] == "pong":
                rtt = msg["_rx"] - msg["t0"]
                self.samples.append((rtt, msg["serverTime"] + rtt / 2 - msg["_rx"]))
            else:
                await self.inbox.put(msg)

    async def send(self, msg: dict) -> None:
        await self.ws.send_str(json.dumps(msg))

    async def wait_for(self, pred, timeout: float = 10.0) -> dict:
        async def loop():
            while True:
                msg = await self.inbox.get()
                if msg["type"] == "error":
                    raise RuntimeError(f"{self.name}: {msg}")
                if pred(msg):
                    return msg

        return await asyncio.wait_for(loop(), timeout)

    async def calibrate(self) -> None:
        for _ in range(PINGS):
            await self.send({"type": "ping", "t0": now_ms()})
            await asyncio.sleep(0.15)
        await asyncio.sleep(1.0)

    @property
    def offset(self) -> float:
        return min(self.samples)[1]

    @property
    def best_rtt(self) -> float:
        return min(self.samples)[0]


async def run(url: str, rounds: int, media_id: str) -> None:
    async with aiohttp.ClientSession() as http:
        a = Client(await http.ws_connect(url), "A")
        b = Client(await http.ws_connect(url), "B")

        await a.send({"type": "create", "name": "BenchA"})
        code = (await a.wait_for(lambda m: m["type"] == "joined"))["code"]
        await b.send({"type": "join", "code": code, "name": "BenchB"})
        await b.wait_for(lambda m: m["type"] == "joined")
        await asyncio.gather(a.calibrate(), b.calibrate())

        await a.send({"type": "cmd", "action": "load", "mediaId": media_id})
        await asyncio.gather(*(c.wait_for(lambda m: m["type"] == "state") for c in (a, b)))

        fanout_a, fanout_b, spread = [], [], []
        actions = ["pause", "play", "seek"]
        for i in range(rounds):
            action = actions[i % len(actions)]
            cmd = {"type": "cmd", "action": action}
            if action == "seek":
                cmd["position"] = 60.0 + i
            t0 = now_ms()
            await a.send(cmd)
            ra, rb = await asyncio.gather(
                *(c.wait_for(lambda m, act=action: m["type"] == "state" and m["state"]["action"] == act) for c in (a, b))
            )
            fanout_a.append(ra["_rx"] - t0)
            fanout_b.append(rb["_rx"] - t0)
            spread.append(abs(ra["_rx"] - rb["_rx"]))
            await asyncio.sleep(0.2)

        # Re-check clocks after the run.
        await asyncio.gather(a.calibrate(), b.calibrate())
        await a.send({"type": "leave"})
        await b.send({"type": "leave"})

        def line(label: str, xs: list[float]) -> str:
            return f"  {label:<34} median {statistics.median(xs):7.1f} ms   p90 {pct(xs, 0.9):7.1f} ms   max {max(xs):7.1f} ms"

        print(f"\nCouchLink sync bench  ·  {url}  ·  session {code}  ·  {rounds} commands\n")
        print(f"  best RTT                           A {a.best_rtt:.1f} ms   B {b.best_rtt:.1f} ms")
        print(f"  clock agreement |offA - offB|      {abs(a.offset - b.offset):.1f} ms")
        print(line("command -> sender sees new state", fanout_a))
        print(line("command -> other TV sees new state", fanout_b))
        print(line("arrival spread between TVs", spread))
        print(
            "\n  Clock agreement bounds how far apart two TVs' 'expected position' can be.\n"
            "  Fan-out only delays when a pause is noticed; positions are pinned by server\n"
            "  timestamps, so late arrival does not add drift."
        )


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="ws://localhost:8787/ws")
    p.add_argument("--rounds", type=int, default=30)
    p.add_argument("--media", default="sintel")
    a = p.parse_args()
    asyncio.run(run(a.url, a.rounds, a.media))


if __name__ == "__main__":
    main()
