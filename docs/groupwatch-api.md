# GroupWatch: a proposal for watch-together on Fire TV

*From the CouchLink team, Amazon Developer Hackathon 2026. CouchLink is the working prototype behind this proposal.*

## Summary

Fire TV should let any streaming app offer watch-together, the way SharePlay does on Apple TV. Today an app can't, unless it builds and runs its own sync service. A third-party app can't do it for another app either: it can't see or control Prime Video's or Netflix's player.

GroupWatch would close that gap with three pieces:

- **A player contract** that each streaming app implements against its own player.
- **A session service** that Amazon runs.
- **System UI plus Alexa intents** for inviting people and controlling playback together.

The core design choice: **GroupWatch syncs state, never video.** Each home streams the title from its own subscription through the provider's own player, so licensing and DRM work exactly as they do today. Between TVs, only a few numbers travel: which title, playing or paused, position, and when.

## Why it has to be the platform

- **Apps can't reach each other.** A Fire TV app can't read or control another app's player. CouchLink can sync its own player, but not Prime Video's.
- **Every provider would build it again.** Each one would need sessions, invite codes, clock sync and real-time fan-out. Most won't, so customers keep texting "3, 2, 1, play."
- **Only the platform can make it consistent.** Customers should learn one way to invite people and one Alexa phrase ("Alexa, pause for everyone"), not a different one in every app.
- **Amazon owns every layer.** Fire TV, Vega, Alexa and Prime Video all belong to Amazon. Prime Video on Vega can be the first app to adopt it, with no partner negotiation.

## What CouchLink already shows

CouchLink runs this architecture end to end on Fire TV (Vega), Fire OS and the web, using our own Creative Commons catalog.

| Piece | In CouchLink today | Evidence |
|---|---|---|
| Sessions and codes | 6-digit code; join with the remote or by voice | `backend/src/couchlink/core.py` |
| Clock sync | NTP-style pings to the server clock | Two clients agree to within **1–4 ms** on the live backend (`backend/scripts/sync_bench.py`) |
| Command fan-out | API Gateway WebSocket + Lambda + DynamoDB | A pause reaches the other TV in **~125 ms median** (p90 ~200 ms) |
| Drift correction | ±5% speed nudging, re-seek only past a threshold | **35 ms** median TV-to-TV drift between two web clients on the live site |
| Shared remote | Alexa, D-pad and on-screen buttons all call the same core | One code path for every input |
| Running cost | Serverless, scales to zero | Well under **$0.01** of compute and AI per 2-hour session |

The sync engine already talks to each player through a small adapter (`PlayerAdapter` in `app/packages/shared-ui/src/session/useSyncedPlayback.ts`). Two very different players use it today:

- **Web player:** supports speed changes, so it nudges small gaps closed.
- **Vega player:** a speed change flushes playback like a seek, so it skips nudging and re-seeks only past 2.5 s of drift.

The engine itself doesn't change between them. That's the evidence that a partner's player can plug in the same way.

## Proposed API

### 1. Player contract (the streaming app implements it)

A sketch based on the CouchLink adapter that works today:

```ts
interface GroupWatchPlayer {
  /** The app's own content ID. GroupWatch never needs a stream URL. */
  contentId: string;
  /** Position in content time (seconds), excluding ad breaks. */
  getTime(): number;
  seekTo(seconds: number): void;
  play(): void;
  pause(): void;
  isBuffering(): boolean;
  /** Optional: glitch-free speed change, used to close gaps under ~1 s. */
  setRate?(rate: number): void;
  /** Optional: true while this viewer is in an ad break. */
  inAdBreak?(): boolean;
}

interface GroupWatchApp {
  /** Can this viewer play the title (subscription, Region, parental rating)? */
  canPlay(contentId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
}
```

### 2. Session service (Amazon runs it)

- Create or join a session by code, by invite from a contact, or by voice.
- Keep one authoritative record per session: `{contentId, playing, position, updatedAt, actor}`.
- Give every device a synced clock, and push each change to every member.
- Run the correction loop on each device and call the app's `GroupWatchPlayer`. Apps never write sync code.

Apps receive a `GroupSession` object with events: member joined or left, state changed, someone can't play.

### 3. System UI and Alexa

- A standard invite and join sheet, plus a "who did what" banner ("Sam paused").
- Alexa intents that target the whole session: "Alexa, pause for everyone", "Alexa, rewind 30 seconds for everyone", "Alexa, invite Mom to watch."
- A system "waiting for Sam" state while someone buffers or sits in an ad break.

## Subscriptions and licensing

- **Each viewer plays from their own subscription.** GroupWatch carries no video and no license, so the provider's entitlement and DRM checks run unchanged on every TV.
- **The check happens before anyone presses play.** When a title is picked, every member's app answers `canPlay`. If someone can't watch, the group sees why ("Sam needs Prime Video", "Not available in Sam's Region") before choosing.
- **Parental controls carry over.** A kids profile can only join a session whose title its own app allows.

## What players need for tight sync

From our measurements, sync quality depends far more on the player than on the network: the network adds a few ms, while players add seconds.

- **Glitch-free speed change.** Nudging speed ±5% took two web players from ~395 ms apart to 35 ms. On the Vega Virtual Device a speed change flushes the pipeline, so the Vega build falls back to re-seeking, which needs a 2.5 s threshold. The result: Vega keeps whatever offset it lands on, 62–155 ms in a clean run and ~960 ms in a bad one, where a web player converges to ~35 ms. The single biggest improvement Vega could make for GroupWatch is a speed change that doesn't re-buffer.
- **Accurate, frequent `currentTime`.**
- **Fast, predictable seeks.** CouchLink measured stalls of 0.4–4 s after a seek on the Vega Virtual Device.

## Ads

Each viewer of an ad-supported title can get different ad breaks of different lengths. GroupWatch should sync **content time**, not stream time, and hold the group in a "waiting for Sam's break to end" state rather than letting positions drift. That's why the contract includes `inAdBreak()`.

## Optional AI layer

CouchLink's AI features carry over when the app opts in:

- **Joint picks.** Recommendations for everyone's moods at once, limited to titles that every member's `canPlay` allows. IDs are validated against the app's catalog, so the AI can't suggest something that doesn't exist.
- **Spoiler-safe Q&A.** "Alexa, who is that?" pauses everyone and shows one answer card. The app provides timed text (subtitles, cast and character notes) only up to the current position, so the model can't spoil what it hasn't seen.

## Privacy

- The session service stores only display names, the shared playback record, and (if AI is used) moods and votes.
- Sessions expire automatically. CouchLink sets a 24-hour DynamoDB TTL today. Because TTL deletion can lag by up to ~48 hours, a platform service should also refuse expired sessions in code.
- Viewing history isn't shared between members or with other apps.

## Rollout

| Phase | What ships | Needs from Amazon |
|---|---|---|
| 0: today | CouchLink as an SDK for Fire TV apps that own their content and player (free ad-supported channels, indie film, kids, fitness, faith, education) | Nothing |
| 1 | GroupWatch inside Prime Video on Vega, run by Amazon | The session service + Prime Video's player |
| 2 | Public GroupWatch API for Appstore apps, with system UI and Alexa intents | Vega SDK + Alexa |
| 3 | Same title across different services (watch on Prime Video while the other home uses another app) | Shared content IDs across providers |

## Open questions

- **Group size.** CouchLink is tested with 2–3 homes. Large groups need a fan-out design that doesn't make one API call per member.
- **Live content.** Sports and live channels need a shared delay, not a shared position.
- **Fire OS.** Should Fire OS devices get the same API, or only Vega?
- **Calls.** Should video and voice calls be part of GroupWatch or left to other apps?
