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
[[architecture diagram image with Well-Architected pillar labels]]

- **TV app:** React Native on Amazon's multi-TV sample. One codebase covers Vega OS (W3C media player), Fire OS and the web, with spatial navigation for the D-pad.
- **Real-time sync:** API Gateway WebSocket, Lambda (Python) and DynamoDB.
  - The server holds the playback state, and each TV estimates the server clock with NTP-style pings.
  - Each TV re-seeks only when it drifts more than 1 s.
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
- Median sync drift of [[X]] ms (p90 [[Y]] ms), measured on two devices.
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
[[3 bullets]]

## What's next
- Emoji reactions.
- "Catch me up" for late joiners.
- An MCP server for Alexa+.
- A proposal for a Vega **GroupWatch** platform API so any streaming app can offer watch-together.

## How we meet the judging criteria

| Criterion | Evidence |
|---|---|
| Tech Implementation | Server-authoritative sync with clock offset ([[X]] ms median drift); one core for TV, Alexa and web; the Vega W3C media player; Bedrock with validation and fallback |
| Design | 10-foot UI, D-pad-first voting, "who did what" banners, synced countdown, under 60 s to start |
| Potential Impact | Long-distance families and couples; no co-watching exists on Fire OS or Vega today; a path to an Appstore SDK or platform API |
| Quality of Idea | Alexa as a shared remote across two homes; joint recommendations from two people's moods; spoiler-safe Q&A |

---

## Video script (≤ 2:50)

| Time | Shot | Voice-over |
|---|---|---|
| 0:00–0:15 | Two homes split-screen, phones counting down | "Watching together from two cities still means '3, 2, 1, play'." |
| 0:15–0:45 | TV A starts a party, TV B joins by code | "With CouchLink, one code and you're on the same couch." |
| 0:45–1:25 | Both tell Alexa their mood, picks appear, they vote, countdown | "Alexa finds something you'll both love." |
| 1:25–2:00 | "Alexa, who is that?" pauses both TVs, answer card, resume | "Ask anything, without spoilers." |
| 2:00–2:25 | Architecture diagram | "API Gateway WebSocket, Lambda, DynamoDB, Bedrock, Alexa." |
| 2:25–2:50 | Metrics and quotes, closing ask | "Watch-together should be part of Fire TV itself." |

Required: at least one shot of a real Fire TV or the Vega Virtual Device.
