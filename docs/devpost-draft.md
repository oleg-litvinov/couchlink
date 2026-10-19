# Devpost submission draft

> Fill the `[[...]]` placeholders with measured numbers and real quotes before submitting.

**Tagline:** Watch together across homes on Fire TV, in sync, with Alexa as the shared remote.

**Tracks:** Fire TV (primary) · AWS Builder mini challenge

---

## Inspiration
Families who live apart still "watch together" by texting "3, 2, 1, play" and then asking "wait, where are you?" for the rest of the movie. Fire OS and Vega OS have no built-in co-watching feature. The existing tools need a browser or a phone, or have been shut down. We worked backwards from one customer: two people in two homes, watching tonight.

[[Real user quote from testing]]

## What it does
1. **Start a watch party** on Fire TV and get a 6-digit code. The other person enters it on their TV with the remote, or says "Alexa, tell CouchLink code 482913, I'm Sam".
2. **Joint discovery.** Each person tells Alexa their mood (or picks mood chips). Amazon Bedrock ranks our catalog for *both* people and explains each pick ("Animation for Alex, fantasy for Sam, 15 min").
3. **Vote with the D-pad.** When everyone's in, the movie starts on every TV after the same 3-second countdown.
4. **Stay in sync.**
   - Anyone can pause, play or seek, and it happens on every TV.
   - Each TV shows who did it ("Sam paused").
   - A live badge shows the measured drift.
5. **Ask mid-show.** "Alexa, who is that?" or the on-screen Ask button pauses every TV and shows the same answer card. Answers are spoiler-safe by construction.

## How we built it
![CouchLink architecture](docs/architecture.svg) [[Export to PNG for the Devpost upload.]]

- **TV app:** React Native on Amazon's multi-TV sample. One codebase covers Vega OS (W3C media player), Fire OS and the web, with spatial navigation for the D-pad.
- **Real-time sync:** API Gateway WebSocket, Lambda (Python) and DynamoDB.
  - The server holds the playback state, and each TV estimates the server clock with NTP-style pings.
  - Each TV closes small gaps by nudging playback speed ±5% (imperceptible, no re-buffering) and only re-seeks when it drifts more than 1 s.
- **AI:** the Amazon Bedrock Converse API with Nova 2 Lite, plus Guardrails. Each AI path has a safety mechanism:
  - Picks are validated against catalog IDs.
  - Q&A context is cut off at the current timestamp.
  - A deterministic fallback takes over if Bedrock throttles.
- **Voice:** an Alexa custom skill on Lambda that calls the same core functions as the TV.
- **Delivery and ops:** S3 and CloudFront serve the web app and 720p faststart media. A CloudWatch dashboard tracks AI latency. Everything is defined in one AWS SAM template.
- **Dev workflow:** Kiro steering plus Claude Code.

## Challenges (mini COE)
**What broke:** our first demo videos took 20+ seconds to start, and drift spiked after every seek.

**Five whys:**
1. Why was start slow? The player had to download a lot before it could play.
2. Why? The source MP4s had their index (`moov`) at the *end*.
3. Why didn't we notice? The well-known sample URLs we planned to use now return 403, so we switched sources late.
4. Why did that hurt sync? Each seek re-buffered from a slow origin.
5. Why was there no fallback? We had no mechanism to check media before the demo.

**Mechanism:**
- The catalog builder now probes every file for faststart.
- Media is transcoded to 720p `+faststart` and served from CloudFront.
- The sync engine pauses drift correction while the player is buffering.

## Accomplishments
- Median TV-to-TV drift of **35 ms** (p90 63 ms) between two web clients on the live site (11 ms median locally), down from a steady ~395 ms before we added speed nudging. [[Re-measure on Fire TV / Vega Virtual Device + web.]]
- On the live AWS backend (us-east-2): two clients agree on the server clock to within **1–4 ms**, and a pause reaches the other TV in **~125 ms median** (p90 ~200 ms) over 210 commands (`backend/scripts/sync_bench.py`).
- [[N]] seconds from app open to watching together.
- [[N]] real test sessions, with [[quotes]].
- End-to-end voice flow: link, mood, pause, ask, resume.

## Responsible AI
- **Controllability:** a human votes before anything plays.
- **Veracity:** picks can only come from the real catalog, and IDs are validated in code.
- **Safety:** Q&A context never includes anything after the current position, so it can't spoil. Bedrock Guardrails filter content.
- **Transparency:** every answer card is labeled "AI answer · spoiler-safe up to mm:ss".
- **Privacy:** we store only display names, moods and votes, with a 24-hour TTL. Nothing is used for training.

## What we learned
- **Nudge, don't seek.** Seeking only when drift passes 1 s left two TVs a steady ~400 ms apart. Changing playback speed by ±5% until they meet brought that to 35 ms with no re-buffering and nothing the viewer notices.
- **Measure the real thing.** A two-client benchmark against the live backend showed the clocks agree to within a few ms, so the remaining drift was in the player, not the network. That told us where to spend the time.
- **Browsers block autoplay for a TV that joined from a link.** The second screen silently never started. It now keeps retrying and asks for one key press, which we only found by testing two real tabs end to end.
- [[team: one lesson from Vega / Alexa / user testing]]

## What's next
**The honest limit:** today CouchLink only plays our own Creative Commons films. A Fire TV app can't see or control Prime Video's or Netflix's player, and no OS-level co-watching API exists. So CouchLink can't sync those services on its own, and we didn't try to hack around it.

**What makes that a solvable problem:** CouchLink syncs *state, never video*. Each home streams from its own subscription, and only `{title, playing, position, time}` travels between TVs. Any player that can report its time and seek can plug in. Ours already runs two very different players, web and Vega, through the same small adapter.

1. **Now: an SDK for Fire TV apps that own their content.** Free ad-supported channels, indie film, kids, fitness and education apps can add watch-together without waiting for anyone.
2. **Next: a Vega GroupWatch platform API, with Prime Video first.** Amazon runs the session service, apps implement a small player contract (time, seek, play, pause, buffering), and Alexa gets "pause for everyone." Full proposal: [`docs/groupwatch-api.md`](docs/groupwatch-api.md).
3. **Product:** "Catch me up" for late joiners, emoji reactions, and an MCP server for Alexa+.

## How we meet the judging criteria

| Criterion | Evidence |
|---|---|
| Tech Implementation | Server-authoritative sync with clock offset (35 ms median TV-to-TV drift on the live site, 1–4 ms clock agreement); one core for TV, Alexa and web; the Vega W3C media player; Bedrock with validation and fallback |
| Design | 10-foot UI, D-pad-first voting, "who did what" banners, synced countdown, under 60 s to start |
| Potential Impact | Long-distance families and couples; no co-watching exists on Fire OS or Vega today; content-agnostic design (syncs state, never video) with a concrete path: an SDK for apps that own their content now, then a GroupWatch platform API with Prime Video first ([proposal](docs/groupwatch-api.md)) |
| Quality of Idea | Alexa as a shared remote across two homes; joint recommendations from two people's moods; spoiler-safe Q&A |

---

## Video script (≤ 2:50)

| Time | Shot | Voice-over |
|---|---|---|
| 0:00–0:15 | Two homes split-screen, phones counting down | "Watching together from two cities still means '3, 2, 1, play'." |
| 0:15–0:45 | TV A starts a party, TV B joins by code | "With CouchLink, one code and you're on the same couch." |
| 0:45–1:25 | Both tell Alexa their mood, picks appear, they vote, countdown | "Alexa finds something you'll both love." |
| 1:25–2:00 | "Alexa, who is that?" pauses both TVs, answer card, resume | "Ask anything, without spoilers." |
| 2:00–2:20 | Architecture diagram; highlight the thin arrow between TVs carrying only `{title, playing, position, time}` | "API Gateway WebSocket, Lambda, DynamoDB, Bedrock and Alexa. And notice what never crosses between homes: the video. Each TV streams from its own source, and we only sync the clock." |
| 2:20–2:35 | Metrics: 35 ms drift, ~125 ms fan-out, under $0.01 per session | "35 milliseconds apart, for under a cent per movie night." |
| 2:35–2:50 | The GroupWatch proposal on screen: player contract → session service → "Alexa, pause for everyone" | "Today it plays our open-licensed films. Any Fire TV app can plug in with a few methods, and Prime Video could be first. Watch-together should be part of Fire TV itself." |

Required: at least one shot of a real Fire TV or the Vega Virtual Device.

Rule check: no third-party trademarks or copyrighted footage. Use only our Creative Commons titles on screen, and *say* "Prime Video" in the voice-over rather than showing its logo or UI.
