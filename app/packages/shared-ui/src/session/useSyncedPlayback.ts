import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from './SessionContext';
import { decide } from './sync';

interface PlayerAdapter {
  mediaId: string | undefined;
  /** Current playback position of the local player, seconds. */
  getTime: () => number;
  seekTo: (seconds: number) => void;
  isBuffering: () => boolean;
  /** Optional: players that support it close small gaps by changing speed. */
  setRate?: (rate: number) => void;
}

const driftLog: number[] = [];

/** Recent absolute drift samples (ms) for the demo/metrics: median, p90. */
export function driftStats(): { median: number; p90: number; n: number } | null {
  if (!driftLog.length) return null;
  const sorted = [...driftLog].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    n: sorted.length,
  };
}

/**
 * Keeps the local player glued to the session's shared playback state.
 * Platform-agnostic: each PlayerScreen supplies a tiny adapter.
 */
export function useSyncedPlayback(adapter: PlayerAdapter) {
  const s = useSession();
  const inSession = !!s.code && !!s.state && s.state.mediaId === adapter.mediaId;
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [drift, setDrift] = useState<number | null>(null);
  const lastSeekAt = useRef(0);
  const ref = useRef({ s, adapter });
  ref.current = { s, adapter };

  const tick = useCallback(() => {
    const { s: sess, adapter: a } = ref.current;
    const st = sess.state;
    if (!st || st.mediaId !== a.mediaId) return;
    const d = decide(st, sess.serverNow(), a.getTime(), {
      buffering: a.isBuffering(),
      msSinceLastSeek: Date.now() - lastSeekAt.current,
    });
    setPaused(d.paused);
    setCountdown(d.countdown);
    if (d.countdown === null && st.playing && !a.isBuffering()) {
      setDrift(d.drift);
      driftLog.push(Math.abs(d.drift) * 1000);
      if (driftLog.length > 600) driftLog.shift();
    } else if (!st.playing) {
      setDrift(null);
    }
    a.setRate?.(d.rate);
    if (d.seekTo !== null) {
      a.seekTo(d.seekTo);
      lastSeekAt.current = Date.now();
    }
  }, []);

  // A fresh command from anyone: allow an immediate correction, then keep ticking.
  useEffect(() => {
    if (!inSession) return;
    lastSeekAt.current = 0;
    tick();
  }, [inSession, s.state?.seq, tick]);

  useEffect(() => {
    if (!inSession) return;
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [inSession, tick]);

  const togglePlay = useCallback(() => {
    const t = ref.current.adapter.getTime();
    if (paused) ref.current.s.play(t);
    else ref.current.s.pause(t);
    setPaused(!paused); // optimistic; the broadcast confirms
  }, [paused]);

  const seekBy = useCallback((delta: number) => {
    ref.current.s.seek(Math.max(0, ref.current.adapter.getTime() + delta));
  }, []);

  return { inSession, paused, countdown, drift, togglePlay, seekBy };
}
