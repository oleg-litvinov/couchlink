"""Simulate Alexa utterances against the local server (POST /alexa).

    uv run python scripts/alexa_sim.py --user alex link 123456 Alex
    uv run python scripts/alexa_sim.py --user alex mood "something funny under 90 minutes"
    uv run python scripts/alexa_sim.py --user alex pause
    uv run python scripts/alexa_sim.py --user alex resume
    uv run python scripts/alexa_sim.py --user alex who "that"
    uv run python scripts/alexa_sim.py --user alex recap
"""

import argparse
import json
import urllib.request

INTENTS = {
    "link": ("LinkIntent", ["code", "name"]),
    "mood": ("MoodIntent", ["mood"]),
    "picks": ("FindPicksIntent", []),
    "pause": ("PauseMovieIntent", []),
    "resume": ("ResumeMovieIntent", []),
    "who": ("WhoIntent", ["query"]),
    "what": ("WhatIntent", ["query"]),
    "why": ("WhyIntent", ["query"]),
    "recap": ("RecapIntent", []),
    "help": ("AMAZON.HelpIntent", []),
}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--user", default="sim-user")
    p.add_argument("--url", default="http://localhost:8787/alexa")
    p.add_argument("command", choices=sorted(INTENTS) + ["launch"])
    p.add_argument("args", nargs="*")
    a = p.parse_args()

    session = {"user": {"userId": f"amzn1.ask.account.{a.user}"}}
    if a.command == "launch":
        request = {"type": "LaunchRequest"}
    else:
        intent, slot_names = INTENTS[a.command]
        slots = {n: {"name": n, "value": v} for n, v in zip(slot_names, a.args)}
        request = {"type": "IntentRequest", "intent": {"name": intent, "slots": slots}}
    body = json.dumps({"version": "1.0", "session": session, "request": request}).encode()
    req = urllib.request.Request(a.url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        resp = json.load(r)
    print("Alexa:", resp["response"].get("outputSpeech", {}).get("text", "(silent)"))


if __name__ == "__main__":
    main()
