"""Joint picks and spoiler-safe Q&A.

BedrockAI uses the Converse API (model set by MODEL_ID). Any failure falls back
to HeuristicAI, which is deterministic and offline, so the demo never dies on a
throttle or a missing credential.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time

from . import content

log = logging.getLogger(__name__)

MAX_PICKS = 5


def _fmt_time(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}" if sec >= 3600 else f"{sec // 60}:{sec % 60:02d}"


# --------------------------------------------------------------------------- heuristic

_KEYWORDS = {
    "funny": ["comedy", "funny", "light"],
    "comedy": ["comedy", "funny"],
    "laugh": ["comedy", "funny"],
    "light": ["light", "feel-good", "comedy"],
    "scary": ["horror", "scary"],
    "horror": ["horror", "scary"],
    "spooky": ["horror", "scary"],
    "action": ["action", "thrilling"],
    "exciting": ["action", "thrilling", "adventure"],
    "adventure": ["adventure"],
    "heist": ["crime", "thrilling"],
    "crime": ["crime", "noir"],
    "mystery": ["mystery", "noir"],
    "sci-fi": ["sci-fi"],
    "scifi": ["sci-fi"],
    "space": ["sci-fi"],
    "robot": ["sci-fi"],
    "fantasy": ["fantasy"],
    "dragon": ["fantasy"],
    "romance": ["romance", "romantic"],
    "romantic": ["romance", "romantic"],
    "date": ["romance", "romantic", "feel-good"],
    "sad": ["emotional", "drama"],
    "cry": ["emotional"],
    "emotional": ["emotional"],
    "drama": ["drama"],
    "kids": ["family", "kids"],
    "family": ["family", "kids"],
    "cute": ["family", "feel-good"],
    "animated": ["animation"],
    "animation": ["animation"],
    "cartoon": ["animation"],
    "classic": ["classic"],
    "old": ["classic"],
    "silent": ["silent"],
    "short": ["short"],
    "quick": ["short"],
    "chill": ["light", "feel-good"],
    "relax": ["light", "feel-good"],
    "weird": ["surreal"],
    "trippy": ["surreal"],
    "dark": ["dark", "noir"],
}


def _tags(t: dict) -> set[str]:
    return {x.lower() for x in t.get("genres", []) + t.get("moods", [])}


def _parse(text: str) -> tuple[set[str], set[str], int | None]:
    """Return (wanted tags, excluded tags, max minutes)."""
    text = text.lower()
    max_min = None
    m = re.search(r"(?:under|less than|shorter than|max|within)\s+(\d+)\s*(min|minute|hour|hr)", text)
    if m:
        max_min = int(m.group(1)) * (60 if m.group(2).startswith("h") else 1)
    elif re.search(r"\b(short|quick)\b", text):
        max_min = 30
    excluded: set[str] = set()
    for neg in re.finditer(r"\b(?:no|not|nothing|without|hate|don't like|dont like)\s+([\w-]+)", text):
        excluded.update(_KEYWORDS.get(neg.group(1), [neg.group(1)]))
    wanted: set[str] = set()
    for word in re.findall(r"[\w-]+", text):
        if word in _KEYWORDS:
            wanted.update(_KEYWORDS[word])
    return wanted - excluded, excluded, max_min


class HeuristicAI:
    def picks(self, prefs: dict[str, str], catalog: list[dict]) -> list[dict]:
        parsed = {name: _parse(text) for name, text in prefs.items()}
        scored = []
        for t in catalog:
            tags, minutes = _tags(t), t["durationSec"] / 60
            per_person, why = [], []
            for name, (wanted, excluded, max_min) in parsed.items():
                hits = wanted & tags
                score = 2 * len(hits)
                if excluded & tags:
                    score -= 10
                if max_min and minutes > max_min:
                    score -= 5
                per_person.append(score)
                if hits:
                    why.append(f"{sorted(hits)[0]} for {name}")
            scored.append((min(per_person), sum(per_person), t, why))
        scored.sort(key=lambda s: (s[0], s[1]), reverse=True)
        out = []
        for _mn, _sm, t, why in scored[:MAX_PICKS]:
            reason = ", ".join(why) + f", {round(t['durationSec'] / 60)} min" if why else t["tagline"]
            reason = reason[:1].upper() + reason[1:]
            out.append({"mediaId": t["id"], "reason": reason})
        return out

    def ask(self, question: str, media_id: str, position: float) -> str:
        t = content.title(media_id) or {}
        q = question.lower()
        seen = content.characters_seen(media_id, position)
        lines = content.subtitles_window(media_id, position, 120)
        if re.search(r"\bwho\b", q) and seen:
            c = max(seen, key=lambda c: c.get("firstSeen", 0))
            others = [x["name"] for x in seen if x is not c][:3]
            extra = f" So far we've also met {', '.join(others)}." if others else ""
            return f"That's likely {c['name']}: {c['description']}{extra}"
        if re.search(r"\b(miss|recap|catch me up|happened|happening)\b", q):
            if lines:
                return "In the last couple of minutes: " + " ".join(l.split("] ", 1)[1] for l in lines[-4:])
            return f"We're {_fmt_time(position)} into {t.get('title', 'the film')}. {t.get('tagline', '')}"
        return f"{t.get('title', 'This film')} ({t.get('year', '')}): {t.get('tagline', '')}"


# --------------------------------------------------------------------------- bedrock

PICKS_SYSTEM = """You are CouchLink's joint recommender. Two or more people in different homes \
want to watch ONE title together. Choose titles from the catalog that best satisfy EVERYONE \
(prefer the title where the least-happy person is happiest; never pick something a person excluded).
Reply with JSON only, no prose: {"picks":[{"id":"<catalog id>","reason":"<max 12 words, mention each person by name>"}]}
Return exactly 5 picks, best first. Only use ids from the catalog."""

ASK_SYSTEM = """You are CouchLink, an AI companion answering a question asked while people watch a film together.
Rules:
- You only know what has happened up to the CURRENT TIME. Never reveal or hint at anything later (no spoilers).
- Use only the provided context. If the answer isn't in it, say you're not sure yet.
- Answer in at most 2 short sentences, friendly, suitable to show on a TV card and read aloud."""


class BedrockAI:
    def __init__(self, model_id: str | None = None, guardrail_id: str | None = None) -> None:
        import boto3
        from botocore.config import Config

        self.model_id = model_id or os.environ.get("MODEL_ID", "amazon.nova-lite-v1:0")
        self.guardrail_id = guardrail_id or os.environ.get("GUARDRAIL_ID") or None
        self.guardrail_version = os.environ.get("GUARDRAIL_VERSION", "DRAFT")
        self._client = boto3.client(
            "bedrock-runtime",
            config=Config(read_timeout=20, connect_timeout=5, retries={"max_attempts": 2, "mode": "standard"}),
        )
        self._fallback = HeuristicAI()
        self._cache: dict[str, object] = {}
        self._paused_until = 0.0  # circuit breaker for quota exhaustion

    def _converse(self, system: str, user: str, max_tokens: int, temperature: float) -> str:
        if time.time() < self._paused_until:
            raise RuntimeError("bedrock paused after quota exhaustion")
        kwargs = dict(
            modelId=self.model_id,
            system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": user}]}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": temperature},
        )
        if self.guardrail_id:
            kwargs["guardrailConfig"] = {
                "guardrailIdentifier": self.guardrail_id,
                "guardrailVersion": self.guardrail_version,
            }
        t0 = time.time()
        try:
            resp = self._client.converse(**kwargs)
        except self._client.exceptions.ThrottlingException as e:
            if "per day" in str(e):
                # Daily quota gone: retrying is pointless; use the fallback for a while.
                self._paused_until = time.time() + 600
            raise
        log.info(json.dumps({"metric": "bedrock_latency_ms", "value": int((time.time() - t0) * 1000), "model": self.model_id}))
        if resp.get("stopReason") == "guardrail_intervened":
            raise RuntimeError("guardrail intervened")
        return "".join(c.get("text", "") for c in resp["output"]["message"]["content"])

    def _cached(self, key: str, fn):
        h = hashlib.sha256(key.encode()).hexdigest()
        if h not in self._cache:
            self._cache[h] = fn()
        return self._cache[h]

    def picks(self, prefs: dict[str, str], catalog: list[dict]) -> list[dict]:
        lines = [
            f"{t['id']} | {t['title']} ({t['year']}) | {round(t['durationSec'] / 60)} min | "
            f"{', '.join(t['genres'] + t['moods'])} | {t['tagline']}"
            for t in catalog
        ]
        people = "\n".join(f"- {name}: \"{text}\"" for name, text in prefs.items())
        user = f"CATALOG (id | title | runtime | tags | tagline):\n" + "\n".join(lines) + f"\n\nPEOPLE:\n{people}"
        try:
            return self._cached("picks" + user, lambda: self._validated_picks(user, prefs, catalog))
        except Exception:
            log.exception("bedrock picks failed; using heuristic")
            return self._fallback.picks(prefs, catalog)

    def _validated_picks(self, user: str, prefs: dict[str, str], catalog: list[dict]) -> list[dict]:
        ids = {t["id"] for t in catalog}
        for _attempt in range(2):
            raw = self._converse(PICKS_SYSTEM, user, 600, 0.2)
            m = re.search(r"\{.*\}", raw, re.S)
            try:
                items = json.loads(m.group(0))["picks"] if m else []
            except (json.JSONDecodeError, KeyError, TypeError):
                items = []
            # Mechanism: drop anything not in the catalog (no hallucinated titles).
            valid, seen = [], set()
            for p in items:
                if isinstance(p, dict) and p.get("id") in ids and p["id"] not in seen:
                    seen.add(p["id"])
                    valid.append({"mediaId": p["id"], "reason": str(p.get("reason", ""))[:120]})
            if len(valid) >= 3:
                return valid[:MAX_PICKS]
        heuristic = [p for p in self._fallback.picks(prefs, catalog) if p["mediaId"] not in seen]
        return (valid + heuristic)[:MAX_PICKS]

    def ask(self, question: str, media_id: str, position: float) -> str:
        t = content.title(media_id) or {}
        seen = content.characters_seen(media_id, position)
        lines = content.subtitles_window(media_id, position)
        context = (
            f"FILM: {t.get('title')} ({t.get('year')})\n"
            f"PREMISE (no spoilers): {t.get('tagline')}\n"
            f"CURRENT TIME: {_fmt_time(position)} of {_fmt_time(t.get('durationSec', 0))}\n"
            f"CHARACTERS INTRODUCED SO FAR:\n"
            + ("\n".join(f"- {c['name']}: {c['description']}" for c in seen) or "- (none listed)")
            + "\nRECENT DIALOGUE (up to current time):\n"
            + ("\n".join(lines) or "(no dialogue available)")
            + f"\n\nQUESTION: {question}"
        )
        try:
            return self._cached("ask" + context, lambda: self._converse(ASK_SYSTEM, context, 200, 0.3).strip())
        except Exception:
            log.exception("bedrock ask failed; using heuristic")
            return self._fallback.ask(question, media_id, position)


def make_ai():
    mode = os.environ.get("AI_MODE", "bedrock")
    return HeuristicAI() if mode == "heuristic" else BedrockAI()
