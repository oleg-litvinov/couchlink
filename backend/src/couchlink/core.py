"""Session logic shared by the WebSocket Lambda, the Alexa Lambda and the local server.

The server holds the single source of truth for playback:
    {mediaId, playing, position (s), updatedAt (server ms), actor, action, seq}
Clients compute expected position = position + (serverNow - updatedAt)/1000 while
playing and seek only when they drift more than a threshold. Last write wins.
"""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass, field
from typing import Callable

from . import content
from .bus import Bus
from .store import Store

log = logging.getLogger(__name__)

COUNTDOWN_MS = 3000
CODE_DIGITS = 6


class SessionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Ctx:
    store: Store
    bus: Bus
    ai: object
    now_ms: Callable[[], int] = field(default=lambda: int(time.time() * 1000))


# --------------------------------------------------------------------------- helpers


def current_position(state: dict, now_ms: int) -> float:
    if not state.get("playing"):
        return state.get("position", 0.0)
    return max(0.0, state["position"] + (now_ms - state["updatedAt"]) / 1000)


def members(ctx: Ctx, code: str) -> list[str]:
    names = [d["name"] for _sk, d in ctx.store.query(code, "CONN#")]
    return sorted(set(names))


def broadcast(ctx: Ctx, code: str, msg: dict) -> None:
    for sk, _d in ctx.store.query(code, "CONN#"):
        conn_id = sk.removeprefix("CONN#")
        if not ctx.bus.send(conn_id, msg):
            _drop_conn(ctx, code, conn_id)


def _drop_conn(ctx: Ctx, code: str, conn_id: str) -> None:
    ctx.store.delete(code, f"CONN#{conn_id}")
    ctx.store.delete(f"CONN#{conn_id}", "META")


def _state(ctx: Ctx, code: str) -> dict:
    state = ctx.store.get(code, "STATE")
    if not state:
        raise SessionError("NOT_FOUND", f"No session with code {code}")
    return state


def require_session(ctx: Ctx, code: str) -> dict:
    return _state(ctx, code)


def _new_code(ctx: Ctx) -> str:
    for _ in range(50):
        code = str(random.randint(10 ** (CODE_DIGITS - 1), 10**CODE_DIGITS - 1))
        if not ctx.store.get(code, "STATE"):
            return code
    raise SessionError("BUSY", "Could not allocate a session code")


def _prefs(ctx: Ctx, code: str) -> dict[str, str]:
    return {sk.removeprefix("PREF#"): d["text"] for sk, d in ctx.store.query(code, "PREF#")}


def _votes(ctx: Ctx, code: str) -> dict[str, dict[str, bool]]:
    out: dict[str, dict[str, bool]] = {}
    for sk, d in ctx.store.query(code, "VOTE#"):
        _, media_id, name = sk.split("#", 2)
        out.setdefault(media_id, {})[name] = d["up"]
    return out


def snapshot(ctx: Ctx, code: str) -> dict:
    """Everything a (re)joining TV needs to render the session."""
    return {
        "code": code,
        "state": _state(ctx, code),
        "members": members(ctx, code),
        "prefs": _prefs(ctx, code),
        "votes": _votes(ctx, code),
        "serverTime": ctx.now_ms(),
    }


# --------------------------------------------------------------------------- membership


def create(ctx: Ctx, conn_id: str | None, name: str) -> str:
    code = _new_code(ctx)
    now = ctx.now_ms()
    ctx.store.put(
        code,
        "STATE",
        {
            "mediaId": None,
            "playing": False,
            "position": 0.0,
            "updatedAt": now,
            "actor": name,
            "action": "create",
            "seq": 0,
            "phase": "lobby",
            "picks": [],
            "host": name,
            "createdAt": now,
        },
    )
    if conn_id:
        attach(ctx, conn_id, code, name)
    log.info('{"metric": "session_created", "value": 1}')
    return code


def attach(ctx: Ctx, conn_id: str, code: str, name: str) -> dict:
    _state(ctx, code)
    ctx.store.put(code, f"CONN#{conn_id}", {"name": name})
    ctx.store.put(f"CONN#{conn_id}", "META", {"code": code, "name": name})
    return snapshot(ctx, code)


def announce_join(ctx: Ctx, code: str, name: str, rejoin: bool = False) -> None:
    msg = {"type": "members", "members": members(ctx, code)}
    if not rejoin:
        msg["event"] = f"{name} joined"
    broadcast(ctx, code, msg)


def detach(ctx: Ctx, conn_id: str) -> None:
    meta = ctx.store.get(f"CONN#{conn_id}", "META")
    if not meta:
        return
    _drop_conn(ctx, meta["code"], conn_id)
    if meta["name"] not in members(ctx, meta["code"]):
        broadcast(
            ctx, meta["code"], {"type": "members", "members": members(ctx, meta["code"]), "event": f"{meta['name']} left"}
        )


def whoami(ctx: Ctx, conn_id: str) -> tuple[str, str]:
    meta = ctx.store.get(f"CONN#{conn_id}", "META")
    if not meta:
        raise SessionError("NOT_IN_SESSION", "Join a session first")
    return meta["code"], meta["name"]


# --------------------------------------------------------------------------- playback


def command(ctx: Ctx, code: str, name: str, action: str, position: float | None = None, media_id: str | None = None, reason: str | None = None) -> dict:
    state = _state(ctx, code)
    now = ctx.now_ms()
    pos = position if position is not None else current_position(state, now)
    if action == "play":
        state.update(playing=True, position=pos, updatedAt=now)
    elif action == "pause":
        state.update(playing=False, position=pos, updatedAt=now)
    elif action == "seek":
        state.update(position=max(0.0, pos), updatedAt=now)
    elif action == "load":
        if not content.title(media_id):
            raise SessionError("BAD_MEDIA", f"Unknown title {media_id}")
        # Start together after a short countdown: updatedAt in the future means
        # expected position is negative until then, so every TV waits.
        state.update(mediaId=media_id, playing=True, position=0.0, updatedAt=now + COUNTDOWN_MS, phase="watching")
    elif action == "stop":
        # Back to the picks (if any) with fresh votes, so the group can choose again.
        for sk, _d in ctx.store.query(code, "VOTE#"):
            ctx.store.delete(code, sk)
        phase = "picks" if state.get("picks") else "lobby"
        state.update(mediaId=None, playing=False, position=0.0, updatedAt=now, phase=phase)
    else:
        raise SessionError("BAD_ACTION", f"Unknown action {action}")
    state.update(actor=name, action=action, seq=state["seq"] + 1, reason=reason)
    ctx.store.put(code, "STATE", state)
    broadcast(ctx, code, {"type": "state", "state": state, "serverTime": now})
    return state


# --------------------------------------------------------------------------- discovery


def set_mood(ctx: Ctx, code: str, name: str, text: str) -> dict:
    _state(ctx, code)
    ctx.store.put(code, f"PREF#{name}", {"text": text.strip()[:200]})
    prefs = _prefs(ctx, code)
    broadcast(ctx, code, {"type": "prefs", "prefs": prefs, "event": f"{name} wants: {text.strip()[:60]}"})
    present = members(ctx, code)
    # Auto-generate once everyone in the room (at least two people) has said something.
    if len(prefs) >= 2 and all(m in prefs for m in present):
        find_picks(ctx, code, name)
    return prefs


def find_picks(ctx: Ctx, code: str, name: str) -> list[dict]:
    state = _state(ctx, code)
    prefs = _prefs(ctx, code)
    if not prefs:
        raise SessionError("NO_PREFS", "Tell CouchLink what you're in the mood for first")
    broadcast(ctx, code, {"type": "thinking", "what": "picks"})
    t0 = time.time()
    picks = ctx.ai.picks(prefs, content.catalog())
    log.info(f'{{"metric": "picks_latency_ms", "value": {int((time.time() - t0) * 1000)}}}')
    for sk, _d in ctx.store.query(code, "VOTE#"):
        ctx.store.delete(code, sk)
    state.update(picks=picks, phase="picks")
    ctx.store.put(code, "STATE", state)
    broadcast(ctx, code, {"type": "picks", "picks": picks, "prefs": prefs, "by": name})
    return picks


def vote(ctx: Ctx, code: str, name: str, media_id: str, up: bool) -> dict:
    state = _state(ctx, code)
    ctx.store.put(code, f"VOTE#{media_id}#{name}", {"up": bool(up)})
    votes = _votes(ctx, code)
    broadcast(ctx, code, {"type": "votes", "votes": votes, "event": f"{name} {'👍' if up else '👎'}"})
    present = members(ctx, code)
    mv = votes.get(media_id, {})
    if up and present and all(mv.get(m) is True for m in present) and state.get("phase") == "picks":
        t = content.title(media_id)
        broadcast(ctx, code, {"type": "match", "mediaId": media_id, "title": t["title"] if t else media_id})
        command(ctx, code, name, "load", media_id=media_id, reason="match")
    return votes


# --------------------------------------------------------------------------- Q&A


def ask(ctx: Ctx, code: str, name: str, question: str) -> str:
    state = _state(ctx, code)
    if not state.get("mediaId"):
        return "Start a movie first, then ask me about it."
    position = current_position(state, ctx.now_ms())
    if state.get("playing"):
        command(ctx, code, name, "pause", position=position, reason="ask")
    broadcast(ctx, code, {"type": "thinking", "what": "ask", "question": question, "by": name})
    t0 = time.time()
    answer = ctx.ai.ask(question, state["mediaId"], position)
    log.info(f'{{"metric": "ask_latency_ms", "value": {int((time.time() - t0) * 1000)}}}')
    broadcast(
        ctx,
        code,
        {"type": "card", "question": question, "answer": answer, "by": name, "mediaId": state["mediaId"], "position": position},
    )
    return answer


# --------------------------------------------------------------------------- WebSocket dispatch


def handle_ws(ctx: Ctx, conn_id: str, msg: dict) -> None:
    """Route one client message. Errors go back to the sender only."""
    t = msg.get("type")
    rid = msg.get("rid")  # optional request id echoed back for client-side correlation

    def reply(payload: dict) -> None:
        if rid is not None:
            payload["rid"] = rid
        ctx.bus.send(conn_id, payload)

    try:
        if t == "ping":
            reply({"type": "pong", "t0": msg.get("t0"), "serverTime": ctx.now_ms()})
        elif t == "create":
            name = _clean_name(msg.get("name"))
            code = create(ctx, conn_id, name)
            reply({"type": "joined", "you": name, **snapshot(ctx, code)})
        elif t == "join":
            name = _clean_name(msg.get("name"))
            code = str(msg.get("code", "")).strip()
            snap = attach(ctx, conn_id, code, name)
            reply({"type": "joined", "you": name, **snap})
            announce_join(ctx, code, name, rejoin=bool(msg.get("rejoin")))
        elif t == "leave":
            detach(ctx, conn_id)
            reply({"type": "left"})
        else:
            code, name = whoami(ctx, conn_id)
            if t == "cmd":
                command(ctx, code, name, msg["action"], msg.get("position"), msg.get("mediaId"))
            elif t == "mood":
                set_mood(ctx, code, name, msg.get("text", ""))
            elif t == "findPicks":
                find_picks(ctx, code, name)
            elif t == "vote":
                vote(ctx, code, name, msg["mediaId"], bool(msg.get("up")))
            elif t == "ask":
                ask(ctx, code, name, msg.get("question", "")[:200])
            elif t == "sync":
                reply({"type": "snapshot", **snapshot(ctx, code)})
            else:
                raise SessionError("BAD_TYPE", f"Unknown message type {t}")
    except SessionError as e:
        reply({"type": "error", "code": e.code, "message": e.message})
    except (KeyError, TypeError, ValueError) as e:
        log.exception("bad message")
        reply({"type": "error", "code": "BAD_REQUEST", "message": str(e)})


def _clean_name(name) -> str:
    name = str(name or "").strip()[:20]
    return name or "Guest"
