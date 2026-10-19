import { PlaybackState } from './protocol';

/** Drift beyond which a playing TV re-seeks (seconds). */
export const PLAYING_DRIFT_THRESHOLD = 1.0;
/** Paused TVs should land on the exact frame everyone else sees. */
export const PAUSED_DRIFT_THRESHOLD = 0.3;
/** After a seek, give the player time to buffer before judging drift again. */
export const SEEK_COOLDOWN_MS = 2500;
/** Some players (Vega) stall for seconds after a seek; don't judge drift until playback moves again. */
export const SEEK_SETTLE_MAX_MS = 8000;
/** Default seek lead while playing, before we've measured how long this player stalls. */
export const DEFAULT_SEEK_LEAD = 0.3;
// Seek stalls vary a lot from one seek to the next (0.4-4 s on the Vega Virtual Device), so cap
// the lead below the Vega seek threshold: an overshoot must not trigger another seek.
export const MAX_SEEK_LEAD = 1.5;
/** Below the seek threshold, nudge playback speed to close small gaps smoothly. */
export const NUDGE_DEADBAND = 0.08;
export const NUDGE_RATE = 0.05;
/** Gaps over a second close faster (still no re-buffering). */
export const FAST_NUDGE_RATE = 0.1;
/**
 * Players that can't change speed (Vega) keep any offset below their seek threshold forever.
 * Once playback is steady, an offset beyond TRIM_THRESHOLD gets a corrective seek, at most
 * TRIM_MAX per command so an overshoot can't loop. Smaller offsets stay: a seek on Vega
 * stalls 0.4-4 s, so it would risk landing further off than it started.
 */
export const TRIM_THRESHOLD = 0.3;
export const TRIM_SETTLE_MS = 4000;
export const TRIM_MAX = 2;

export function canTrim(opts: { hasRate: boolean; trimsUsed: number; msStable: number }): boolean {
  return !opts.hasRate && opts.trimsUsed < TRIM_MAX && opts.msStable >= TRIM_SETTLE_MS;
}

/** Where everyone should be right now. Negative = countdown before start. */
export function expectedPosition(state: PlaybackState, serverNow: number): number {
  if (!state.playing) return state.position;
  return state.position + (serverNow - state.updatedAt) / 1000;
}

export interface SyncDecision {
  paused: boolean;
  seekTo: number | null;
  countdown: number | null; // whole seconds left before a synchronized start
  drift: number; // local - expected (seconds)
  rate: number; // playback speed to apply (1 = normal)
  trimmed: boolean; // seekTo is a trim of a small stuck offset (see canTrim)
}

export function decide(
  state: PlaybackState,
  serverNow: number,
  localTime: number,
  opts: {
    buffering: boolean;
    msSinceLastSeek: number;
    /** Where the last seek (while playing) aimed; null once playback has moved past it. */
    settlingTarget?: number | null;
    /** Seconds to aim ahead when seeking while playing (measured seek stall). */
    lead?: number;
    /** Drift (s) beyond which a playing TV seeks; players with slow seeks pass a larger value. */
    playingThreshold?: number;
    /** A trim seek is allowed now (see canTrim). */
    trim?: boolean;
  },
): SyncDecision {
  const expected = expectedPosition(state, serverNow);
  if (expected < 0) {
    return {
      paused: true,
      seekTo: localTime > 0.5 ? 0 : null,
      countdown: Math.ceil(-expected),
      drift: 0,
      rate: 1,
      trimmed: false,
    };
  }
  const drift = localTime - expected;
  const threshold = state.playing ? (opts.playingThreshold ?? PLAYING_DRIFT_THRESHOLD) : PAUSED_DRIFT_THRESHOLD;
  const settling =
    state.playing &&
    opts.settlingTarget != null &&
    localTime < opts.settlingTarget + 0.1 &&
    opts.msSinceLastSeek < SEEK_SETTLE_MAX_MS;
  const canSeek = !opts.buffering && !settling && opts.msSinceLastSeek > SEEK_COOLDOWN_MS;
  const lead = state.playing ? (opts.lead ?? DEFAULT_SEEK_LEAD) : 0;
  const reseek = canSeek && Math.abs(drift) > threshold;
  const trimmed = !reseek && canSeek && state.playing && !!opts.trim && Math.abs(drift) > TRIM_THRESHOLD;
  const seekTo = reseek || trimmed ? expected + lead : null;
  // Ahead: slow down a little; behind: speed up a little. Imperceptible, no re-buffering.
  const nudge =
    state.playing && !settling && seekTo === null && Math.abs(drift) > NUDGE_DEADBAND && Math.abs(drift) <= threshold;
  return {
    paused: !state.playing,
    seekTo,
    countdown: null,
    drift,
    rate: nudge ? 1 - Math.sign(drift) * (Math.abs(drift) > 1 ? FAST_NUDGE_RATE : NUDGE_RATE) : 1,
    trimmed,
  };
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function describeAction(state: PlaybackState): string | null {
  switch (state.action) {
    case 'pause':
      return state.reason === 'ask' ? `${state.actor} asked a question` : `${state.actor} paused`;
    case 'play':
      return `${state.actor} pressed play`;
    case 'seek':
      return `${state.actor} jumped to ${formatTime(state.position)}`;
    case 'load':
      return state.reason === 'match' ? "It's a match! Starting together" : `${state.actor} started a movie`;
    case 'stop':
      return `${state.actor} ended the movie`;
    default:
      return null;
  }
}
