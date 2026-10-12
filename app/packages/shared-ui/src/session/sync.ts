import { PlaybackState } from './protocol';

/** Drift beyond which a playing TV re-seeks (seconds). */
export const PLAYING_DRIFT_THRESHOLD = 1.0;
/** Paused TVs should land on the exact frame everyone else sees. */
export const PAUSED_DRIFT_THRESHOLD = 0.3;
/** After a seek, give the player time to buffer before judging drift again. */
export const SEEK_COOLDOWN_MS = 2500;

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
}

export function decide(
  state: PlaybackState,
  serverNow: number,
  localTime: number,
  opts: { buffering: boolean; msSinceLastSeek: number },
): SyncDecision {
  const expected = expectedPosition(state, serverNow);
  if (expected < 0) {
    return {
      paused: true,
      seekTo: localTime > 0.5 ? 0 : null,
      countdown: Math.ceil(-expected),
      drift: 0,
    };
  }
  const drift = localTime - expected;
  const threshold = state.playing ? PLAYING_DRIFT_THRESHOLD : PAUSED_DRIFT_THRESHOLD;
  const canSeek = !opts.buffering && opts.msSinceLastSeek > SEEK_COOLDOWN_MS;
  return {
    paused: !state.playing,
    // Aim slightly ahead while playing to cover the seek/buffer latency.
    seekTo: canSeek && Math.abs(drift) > threshold ? expected + (state.playing ? 0.3 : 0) : null,
    countdown: null,
    drift,
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
