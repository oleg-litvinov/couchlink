"""Alexa custom skill: the voice "shared remote" for a CouchLink session.

Raw request/response JSON (no SDK dependency). The Lambda trigger is restricted
to our skill ID in the SAM template, so request signature checks are handled
by Alexa -> Lambda integration.
"""

from __future__ import annotations

import logging
import os

from couchlink import core

logging.getLogger().setLevel(logging.INFO)
log = logging.getLogger(__name__)

_ctx: core.Ctx | None = None


def _default_ctx() -> core.Ctx:
    global _ctx
    if _ctx is None:
        from couchlink.ai import make_ai
        from couchlink.bus import ApiGatewayBus
        from couchlink.store import DynamoStore

        _ctx = core.Ctx(store=DynamoStore(), bus=ApiGatewayBus(os.environ["WS_ENDPOINT"]), ai=make_ai())
    return _ctx


def _speak(text: str, end: bool = True, card: str | None = None, reprompt: str | None = None) -> dict:
    resp: dict = {"outputSpeech": {"type": "PlainText", "text": text}, "shouldEndSession": end}
    if card:
        resp["card"] = {"type": "Simple", "title": "CouchLink", "content": card}
    if reprompt:
        resp["reprompt"] = {"outputSpeech": {"type": "PlainText", "text": reprompt}}
    return {"version": "1.0", "response": resp}


def _slot(intent: dict, name: str) -> str | None:
    slot = intent.get("slots", {}).get(name) or {}
    return slot.get("value")


QUESTION_PREFIX = {
    "WhoIntent": "Who is",
    "WhatIntent": "What is",
    "WhyIntent": "Why",
}

HELP = (
    "First, link this device: say, tell CouchLink code, followed by the six digit code on your TV, and your name. "
    "Then you can say what you're in the mood for, pause, resume, or ask who is that."
)


def handle(event: dict, ctx: core.Ctx | None = None) -> dict:
    ctx = ctx or _default_ctx()
    req = event["request"]
    user_id = event["session"]["user"]["userId"] if "session" in event else event["context"]["System"]["user"]["userId"]
    link = ctx.store.get(f"ALEXA#{user_id}", "LINK")

    if req["type"] == "LaunchRequest":
        if link:
            return _speak(f"You're in session {_digits(link['code'])} as {link['name']}. What would you like?", end=False, reprompt="You can say pause, resume, or ask who is that.")
        return _speak("Welcome to CouchLink. What's the code on your TV, and your name?", end=False, reprompt=HELP)
    if req["type"] == "SessionEndedRequest":
        return {"version": "1.0", "response": {}}
    if req["type"] != "IntentRequest":
        return _speak("Sorry, I didn't get that.")

    intent = req["intent"]
    name = intent["name"]

    try:
        if name == "LinkIntent":
            code = (_slot(intent, "code") or "").replace(" ", "")
            person = (_slot(intent, "name") or (link or {}).get("name") or "Guest").capitalize()
            if not code:
                return _speak("What's the six digit code on your TV?", end=False, reprompt="Say, code, then the digits.")
            core.require_session(ctx, code)
            ctx.store.put(f"ALEXA#{user_id}", "LINK", {"code": code, "name": person})
            core.broadcast(ctx, code, {"type": "toast", "event": f"{person} connected Alexa"})
            return _speak(f"Got it, {person}. You're linked to session {_digits(code)}. Tell me what you're in the mood for.", end=False, reprompt="For example: something funny, under ninety minutes.")

        if name in ("AMAZON.HelpIntent",):
            return _speak(HELP, end=False)
        if name in ("AMAZON.StopIntent", "AMAZON.CancelIntent"):
            return _speak("Enjoy the show!")
        if not link:
            return _speak("This device isn't linked to a session yet. " + HELP, end=False)

        code, person = link["code"], link["name"]

        if name == "MoodIntent":
            mood = _slot(intent, "mood")
            if not mood:
                return _speak("What are you in the mood for?", end=False)
            prefs = core.set_mood(ctx, code, person, mood)
            waiting = [m for m in core.members(ctx, code) if m not in prefs]
            if waiting:
                return _speak(f"Noted. Waiting for {' and '.join(waiting)} to say what they want.")
            return _speak("Noted. Your picks are on the TV. Vote with the thumbs up button.")
        if name == "FindPicksIntent":
            core.find_picks(ctx, code, person)
            return _speak("Here are some picks for all of you, on the TV now.")
        if name in ("PauseMovieIntent", "AMAZON.PauseIntent"):
            core.command(ctx, code, person, "pause")
            return _speak("Paused for everyone.")
        if name in ("ResumeMovieIntent", "AMAZON.ResumeIntent"):
            core.command(ctx, code, person, "play")
            return _speak("Resuming for everyone.")
        if name in QUESTION_PREFIX:
            question = f"{QUESTION_PREFIX[name]} {_slot(intent, 'query') or 'that'}?"
            answer = core.ask(ctx, code, person, question)
            return _speak(answer + " Say resume when you're ready.", card=f"{question}\n{answer}")
        if name == "RecapIntent":
            answer = core.ask(ctx, code, person, "What did I miss? Recap what just happened.")
            return _speak(answer + " Say resume when you're ready.", card=answer)
        if name == "AMAZON.FallbackIntent":
            return _speak("Sorry, I can pause, resume, find picks, or answer questions about the movie.", end=False)
    except core.SessionError as e:
        if e.code == "NOT_FOUND":
            return _speak("I couldn't find that session. Check the code on your TV and try again.", end=False)
        return _speak(e.message)

    log.warning("unhandled intent %s", name)
    return _speak("Sorry, I can't do that yet.")


def _digits(code: str) -> str:
    return " ".join(code)


def handler(event, _context):
    return handle(event)
