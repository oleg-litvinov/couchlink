"""Local dev server: same core logic, in-memory store, aiohttp WebSocket.

    uv run python local_server.py            # ws://localhost:8787/ws
    AI_MODE=bedrock uv run python local_server.py   # use Bedrock with your AWS creds

Also exposes POST /alexa (Alexa request JSON) so scripts/alexa_sim.py can
exercise the voice flow without a real Echo.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from aiohttp import WSMsgType, web

import alexa_handler
from couchlink import core
from couchlink.ai import make_ai
from couchlink.bus import CallbackBus
from couchlink.store import MemoryStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("local")

os.environ.setdefault("AI_MODE", "heuristic")


class LocalHub:
    def __init__(self) -> None:
        self.sockets: dict[str, web.WebSocketResponse] = {}
        self.loop: asyncio.AbstractEventLoop | None = None

    def deliver(self, conn_id: str, msg: dict) -> bool:
        ws = self.sockets.get(conn_id)
        if ws is None or ws.closed:
            return False
        asyncio.run_coroutine_threadsafe(ws.send_str(json.dumps(msg)), self.loop)
        return True


hub = LocalHub()
ctx = core.Ctx(store=MemoryStore(), bus=CallbackBus(hub.deliver), ai=make_ai())


async def ws_route(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)
    conn_id = uuid.uuid4().hex[:12]
    hub.sockets[conn_id] = ws
    log.info("connect %s", conn_id)
    loop = asyncio.get_running_loop()
    try:
        async for m in ws:
            if m.type != WSMsgType.TEXT:
                continue
            try:
                msg = json.loads(m.data)
            except json.JSONDecodeError:
                continue
            if msg.get("type") != "ping":
                log.info("<- %s %s", conn_id, m.data[:200])
            # Core is synchronous (it mirrors Lambda); keep the event loop free.
            await loop.run_in_executor(None, core.handle_ws, ctx, conn_id, msg)
    finally:
        hub.sockets.pop(conn_id, None)
        await loop.run_in_executor(None, core.detach, ctx, conn_id)
        log.info("disconnect %s", conn_id)
    return ws


async def alexa_route(request: web.Request) -> web.Response:
    event = await request.json()
    resp = await asyncio.get_running_loop().run_in_executor(None, alexa_handler.handle, event, ctx)
    return web.json_response(resp)


async def health(_request: web.Request) -> web.Response:
    return web.json_response({"ok": True, "sockets": len(hub.sockets), "ai": type(ctx.ai).__name__})


@web.middleware
async def cors(request, handler):
    resp = await handler(request)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


async def on_startup(_app):
    hub.loop = asyncio.get_running_loop()


def main() -> None:
    app = web.Application(middlewares=[cors])
    app.router.add_get("/ws", ws_route)
    app.router.add_post("/alexa", alexa_route)
    app.router.add_get("/health", health)
    app.on_startup.append(on_startup)
    port = int(os.environ.get("PORT", "8787"))
    log.info("CouchLink local server on ws://0.0.0.0:%d/ws (AI: %s)", port, type(ctx.ai).__name__)
    web.run_app(app, host="0.0.0.0", port=port, print=None)


if __name__ == "__main__":
    main()
