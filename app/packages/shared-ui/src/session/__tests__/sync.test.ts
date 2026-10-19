import { canTrim, decide, expectedPosition, FAST_NUDGE_RATE, NUDGE_RATE, TRIM_MAX, TRIM_SETTLE_MS } from '../sync';
import type { PlaybackState } from '../protocol';

const base: PlaybackState = {
  mediaId: 'sintel',
  playing: true,
  position: 100,
  updatedAt: 1_000_000,
  actor: 'Alex',
  action: 'play',
  seq: 1,
  phase: 'watching',
  picks: [],
  host: 'Alex',
};
const idle = { buffering: false, msSinceLastSeek: 10_000 };
const at = (seconds: number) => base.updatedAt + seconds * 1000;

describe('expectedPosition', () => {
  it('advances with server time while playing', () => {
    expect(expectedPosition(base, at(5))).toBeCloseTo(105);
  });
  it('holds still while paused', () => {
    expect(expectedPosition({ ...base, playing: false }, at(5))).toBe(100);
  });
});

describe('decide', () => {
  it('counts down before a synchronized start', () => {
    const d = decide({ ...base, position: 0, updatedAt: at(3) }, at(0.5), 0, idle);
    expect(d).toMatchObject({ paused: true, countdown: 3, rate: 1 });
  });

  it('leaves playback alone inside the deadband', () => {
    const d = decide(base, at(10), 110.05, idle);
    expect(d.seekTo).toBeNull();
    expect(d.rate).toBe(1);
  });

  it('slows down when slightly ahead and speeds up when slightly behind', () => {
    expect(decide(base, at(10), 110.4, idle).rate).toBeCloseTo(1 - NUDGE_RATE);
    expect(decide(base, at(10), 109.6, idle).rate).toBeCloseTo(1 + NUDGE_RATE);
  });

  it('re-seeks (aiming slightly ahead) when drift exceeds 1 s', () => {
    const d = decide(base, at(10), 108, idle);
    expect(d.seekTo).toBeCloseTo(110.3);
    expect(d.rate).toBe(1);
  });

  it('does not seek while buffering or right after a seek', () => {
    expect(decide(base, at(10), 108, { buffering: true, msSinceLastSeek: 10_000 }).seekTo).toBeNull();
    expect(decide(base, at(10), 108, { buffering: false, msSinceLastSeek: 500 }).seekTo).toBeNull();
  });

  it('snaps a paused TV to the exact frame with a tighter threshold', () => {
    const paused: PlaybackState = { ...base, playing: false };
    expect(decide(paused, at(10), 100.5, idle).seekTo).toBe(100);
    expect(decide(paused, at(10), 100.1, idle).seekTo).toBeNull();
    expect(decide(paused, at(10), 100.5, idle).rate).toBe(1);
  });

  it('waits for a seek to settle instead of re-seeking a stalled player', () => {
    // Seeked to 110.3 three seconds ago; the player is still stuck there (re-buffering).
    const d = decide(base, at(13), 110.3, { buffering: false, msSinceLastSeek: 3000, settlingTarget: 110.3 });
    expect(d.seekTo).toBeNull();
    expect(d.rate).toBe(1);
  });

  it('gives up waiting after the settle timeout', () => {
    const d = decide(base, at(20), 110.3, { buffering: false, msSinceLastSeek: 9000, settlingTarget: 110.3 });
    expect(d.seekTo).not.toBeNull();
  });

  it('leads the seek target by the measured stall', () => {
    expect(decide(base, at(10), 105, { ...idle, lead: 2 }).seekTo).toBeCloseTo(112);
  });

  it('lets a player with slow seeks absorb larger drift by changing speed', () => {
    // Vega jumps ~2 s ahead on resume; with a 2.5 s seek threshold that is nudged, not seeked.
    const d = decide(base, at(10), 112, { ...idle, playingThreshold: 2.5 });
    expect(d.seekTo).toBeNull();
    expect(d.rate).toBeCloseTo(1 - FAST_NUDGE_RATE);
    expect(decide(base, at(10), 113, { ...idle, playingThreshold: 2.5 }).seekTo).not.toBeNull();
  });

  it('trims a stuck offset with one seek on a player that cannot change speed', () => {
    // Vega landed ~0.96 s behind after a start and would stay there: below its 2.5 s threshold.
    const d = decide(base, at(10), 109.04, { ...idle, playingThreshold: 2.5, trim: true });
    expect(d.seekTo).toBeCloseTo(110.3);
    expect(d.trimmed).toBe(true);
  });

  it('leaves offsets under the trim threshold alone', () => {
    // ~155 ms is what a clean Vega start lands on; a seek would risk overshooting by more.
    const d = decide(base, at(10), 109.85, { ...idle, playingThreshold: 2.5, trim: true });
    expect(d.seekTo).toBeNull();
    expect(d.trimmed).toBe(false);
  });

  it('does not trim without permission, while settling or right after a seek', () => {
    const vega = { playingThreshold: 2.5 };
    expect(decide(base, at(10), 109, { ...idle, ...vega }).seekTo).toBeNull();
    expect(decide(base, at(10), 109, { buffering: false, msSinceLastSeek: 500, ...vega, trim: true }).seekTo).toBeNull();
    expect(
      decide(base, at(13), 110.3, { buffering: false, msSinceLastSeek: 3000, settlingTarget: 110.3, ...vega, trim: true })
        .seekTo,
    ).toBeNull();
  });
});

describe('canTrim', () => {
  const steady = { hasRate: false, trimsUsed: 0, msStable: TRIM_SETTLE_MS + 1 };
  it('allows a trim once a speed-less player has played steadily', () => {
    expect(canTrim(steady)).toBe(true);
  });
  it('never trims players that can nudge speed instead', () => {
    expect(canTrim({ ...steady, hasRate: true })).toBe(false);
  });
  it('waits for playback to be steady first', () => {
    expect(canTrim({ ...steady, msStable: TRIM_SETTLE_MS - 1 })).toBe(false);
  });
  it('stops after the per-command budget so an overshoot cannot loop', () => {
    expect(canTrim({ ...steady, trimsUsed: TRIM_MAX })).toBe(false);
  });
});
