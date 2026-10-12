import pytest

import alexa_handler
from couchlink import content, core
from couchlink.ai import HeuristicAI
from couchlink.bus import CallbackBus
from couchlink.store import MemoryStore


class Clock:
    def __init__(self):
        self.t = 1_000_000

    def __call__(self):
        return self.t


@pytest.fixture
def env():
    inbox: dict[str, list[dict]] = {}
    gone: set[str] = set()

    def deliver(conn_id, msg):
        if conn_id in gone:
            return False
        inbox.setdefault(conn_id, []).append(msg)
        return True

    clock = Clock()
    ctx = core.Ctx(store=MemoryStore(), bus=CallbackBus(deliver), ai=HeuristicAI(), now_ms=clock)
    return ctx, inbox, clock, gone


def last(inbox, conn, type_):
    return [m for m in inbox.get(conn, []) if m["type"] == type_][-1]


def start_pair(ctx, inbox):
    core.handle_ws(ctx, "a", {"type": "create", "name": "Alex"})
    code = last(inbox, "a", "joined")["code"]
    core.handle_ws(ctx, "b", {"type": "join", "code": code, "name": "Sam"})
    return code


def test_create_join_and_members(env):
    ctx, inbox, _, _ = env
    code = start_pair(ctx, inbox)
    assert len(code) == 6 and code.isdigit()
    assert last(inbox, "b", "joined")["members"] == ["Alex", "Sam"]
    assert last(inbox, "a", "members")["event"] == "Sam joined"


def test_join_unknown_code_errors_to_sender_only(env):
    ctx, inbox, _, _ = env
    core.handle_ws(ctx, "x", {"type": "join", "code": "000000", "name": "Eve"})
    assert last(inbox, "x", "error")["code"] == "NOT_FOUND"


def test_playback_sync_and_position_math(env):
    ctx, inbox, clock, _ = env
    start_pair(ctx, inbox)
    core.handle_ws(ctx, "a", {"type": "cmd", "action": "load", "mediaId": "sintel"})
    s = last(inbox, "b", "state")["state"]
    assert s["playing"] and s["updatedAt"] == clock.t + core.COUNTDOWN_MS
    # During countdown, expected position stays at 0.
    assert core.current_position(s, clock.t + 1000) == 0
    clock.t += core.COUNTDOWN_MS + 10_000
    assert core.current_position(s, clock.t) == pytest.approx(10.0)
    core.handle_ws(ctx, "b", {"type": "cmd", "action": "pause", "position": 10.2})
    s = last(inbox, "a", "state")["state"]
    assert s == {**s, "playing": False, "position": 10.2, "actor": "Sam", "action": "pause"}
    core.handle_ws(ctx, "a", {"type": "cmd", "action": "seek", "position": 60})
    assert last(inbox, "b", "state")["state"]["position"] == 60


def test_moods_auto_generate_picks_then_match_starts_playback(env):
    ctx, inbox, _, _ = env
    start_pair(ctx, inbox)
    core.handle_ws(ctx, "a", {"type": "mood", "text": "something funny, under 20 minutes"})
    assert not [m for m in inbox["a"] if m["type"] == "picks"]
    core.handle_ws(ctx, "b", {"type": "mood", "text": "cute animation, no horror"})
    picks = last(inbox, "a", "picks")["picks"]
    ids = {t["id"] for t in content.catalog()}
    assert 3 <= len(picks) <= 5 and all(p["mediaId"] in ids for p in picks)
    top = content.title(picks[0]["mediaId"])
    assert "Horror" not in top["genres"] and top["durationSec"] <= 20 * 60
    mid = picks[0]["mediaId"]
    core.handle_ws(ctx, "a", {"type": "vote", "mediaId": mid, "up": True})
    assert not [m for m in inbox["a"] if m["type"] == "match"]
    core.handle_ws(ctx, "b", {"type": "vote", "mediaId": mid, "up": True})
    assert last(inbox, "a", "match")["mediaId"] == mid
    assert last(inbox, "b", "state")["state"]["mediaId"] == mid


def test_ask_pauses_everyone_and_is_spoiler_safe(env):
    ctx, inbox, clock, _ = env
    start_pair(ctx, inbox)
    core.handle_ws(ctx, "a", {"type": "cmd", "action": "load", "mediaId": "sintel"})
    clock.t += core.COUNTDOWN_MS + 200_000  # 200 s in: Scales seen, dragon not yet
    core.handle_ws(ctx, "b", {"type": "ask", "question": "Who is that?"})
    assert last(inbox, "a", "state")["state"]["playing"] is False
    card = last(inbox, "a", "card")
    assert "Scales" in card["answer"]
    assert "carried Scales away" not in card["answer"]  # reveal at 270 s not leaked


def test_dead_connections_are_pruned(env):
    ctx, inbox, _, gone = env
    code = start_pair(ctx, inbox)
    gone.add("b")
    core.handle_ws(ctx, "a", {"type": "cmd", "action": "pause", "position": 1})
    assert core.members(ctx, code) == ["Alex"]


def test_disconnect_broadcasts_leave(env):
    ctx, inbox, _, _ = env
    start_pair(ctx, inbox)
    core.detach(ctx, "b")
    assert last(inbox, "a", "members") == {"type": "members", "members": ["Alex"], "event": "Sam left"}


def _alexa(ctx, user, intent=None, **slots):
    req = {"type": "LaunchRequest"} if intent is None else {
        "type": "IntentRequest",
        "intent": {"name": intent, "slots": {k: {"name": k, "value": v} for k, v in slots.items()}},
    }
    event = {"version": "1.0", "session": {"user": {"userId": user}}, "request": req}
    return alexa_handler.handle(event, ctx)["response"]["outputSpeech"]["text"]


def test_alexa_voice_flow(env):
    ctx, inbox, clock, _ = env
    code = start_pair(ctx, inbox)
    assert "isn't linked" in _alexa(ctx, "u1", "PauseMovieIntent")
    assert "couldn't find" in _alexa(ctx, "u1", "LinkIntent", code="999999", name="alex")
    assert "linked" in _alexa(ctx, "u1", "LinkIntent", code=code, name="alex")
    _alexa(ctx, "u2", "LinkIntent", code=code, name="sam")
    assert "Waiting for Sam" in _alexa(ctx, "u1", "MoodIntent", mood="something scary")
    assert "picks are on the TV" in _alexa(ctx, "u2", "MoodIntent", mood="classic horror")
    pick = last(inbox, "a", "picks")["picks"][0]["mediaId"]
    assert "Horror" in content.title(pick)["genres"]
    core.command(ctx, code, "Alex", "load", media_id="sintel")
    clock.t += core.COUNTDOWN_MS + 100_000
    assert "Paused" in _alexa(ctx, "u1", "PauseMovieIntent")
    assert last(inbox, "b", "state")["state"]["actor"] == "Alex"
    answer = _alexa(ctx, "u2", "WhoIntent", query="that old man")
    assert "Shaman" in answer and last(inbox, "a", "card")["by"] == "Sam"
    assert "Resuming" in _alexa(ctx, "u1", "ResumeMovieIntent")
    assert last(inbox, "a", "state")["state"]["playing"] is True


def test_stop_returns_to_picks_with_fresh_votes(env):
    ctx, inbox, _, _ = env
    start_pair(ctx, inbox)
    core.handle_ws(ctx, "a", {"type": "mood", "text": "funny"})
    core.handle_ws(ctx, "b", {"type": "mood", "text": "animated"})
    mid = last(inbox, "a", "picks")["picks"][0]["mediaId"]
    for c in ("a", "b"):
        core.handle_ws(ctx, c, {"type": "vote", "mediaId": mid, "up": True})
    core.handle_ws(ctx, "a", {"type": "cmd", "action": "stop"})
    s = last(inbox, "b", "state")["state"]
    assert s["phase"] == "picks" and s["mediaId"] is None
    assert core.snapshot(ctx, s and core.whoami(ctx, "a")[0])["votes"] == {}
    for c in ("a", "b"):
        core.handle_ws(ctx, c, {"type": "vote", "mediaId": mid, "up": True})
    assert last(inbox, "a", "state")["state"]["mediaId"] == mid
