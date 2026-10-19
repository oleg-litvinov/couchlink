import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from './SessionContext';
import { canTrim, decide, DEFAULT_SEEK_LEAD, expectedPosition, MAX_SEEK_LEAD, SEEK_COOLDOWN_MS } from './sync';

interface PlayerAdapter {
  mediaId: string | undefined;
  /** Current playback position of the local player, seconds. */
  getTime: () => number;
  seekTo: (seconds: number) => void;
  isBuffering: () => boolean;
  /** Optional: players that support it close small gaps by changing speed. */
  setRate?: (rate: number) => void;
  /** Optional: drift (s) before re-seeking while playing; raise it for players whose seeks stall. */
  seekThreshold?: number;
}

const driftLog: number[] = [];
/** How often a TV logs its drift summary (read with `loggingctl` on Vega, the console on web). */
const DRIFT_REPORT_MS = 10000;
let lastDriftReport = 0;
/** Signed drift samples (ms) since the last report: + means this TV is ahead. */
let reportWindow: number[] = [];

function reportDrift() {
  if (!reportWindow.length) return;
  const abs = reportWindow.map(Math.abs).sort((a, b) => a - b);
  const signed = [...reportWindow].sort((a, b) => a - b);
  const pick = (xs: number[], q: number) => Math.round(xs[Math.floor(xs.length * q)]);
  console.log(
    `[couchlink] drift ms median=${pick(abs, 0.5)} p90=${pick(abs, 0.9)} signed=${pick(signed, 0.5)} n=${abs.length}`,
  );
  reportWindow = [];
}

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
  // Seek-while-playing bookkeeping: where we aimed, and how far ahead to aim next time.
  const settlingTarget = useRef<number | null>(null);
  const seekLead = useRef(DEFAULT_SEEK_LEAD);
  // Trims of a stuck offset (players without speed control): budget per command, and since
  // when playback has run steadily (playing, not buffering, not settling after a seek).
  const trimsUsed = useRef(0);
  const steadySince = useRef<number | null>(null);
  const ref = useRef({ s, adapter });
  ref.current = { s, adapter };

  const tick = useCallback(() => {
    const { s: sess, adapter: a } = ref.current;
    const st = sess.state;
    if (!st || st.mediaId !== a.mediaId) return;
    const local = a.getTime();
    const sinceSeek = Date.now() - lastSeekAt.current;
    if (settlingTarget.current !== null && local >= settlingTarget.current + 0.1) {
      // Playback moved again: the stall is the time since the seek minus what has played since.
      const stall = sinceSeek / 1000 - (local - settlingTarget.current);
      seekLead.current = Math.min(MAX_SEEK_LEAD, Math.max(DEFAULT_SEEK_LEAD, stall + 0.1));
      settlingTarget.current = null;
    }
    const now = Date.now();
    const steady =
      st.playing &&
      !a.isBuffering() &&
      settlingTarget.current === null &&
      sinceSeek > SEEK_COOLDOWN_MS &&
      expectedPosition(st, sess.serverNow()) >= 0;
    if (!steady) steadySince.current = null;
    else if (steadySince.current === null) steadySince.current = now;
    const d = decide(st, sess.serverNow(), local, {
      buffering: a.isBuffering(),
      msSinceLastSeek: sinceSeek,
      settlingTarget: settlingTarget.current,
      lead: seekLead.current,
      playingThreshold: a.seekThreshold,
      trim: canTrim({
        hasRate: !!a.setRate,
        trimsUsed: trimsUsed.current,
        msStable: steadySince.current === null ? 0 : now - steadySince.current,
      }),
    });
    setPaused(d.paused);
    setCountdown(d.countdown);
    if (d.countdown === null && st.playing && !a.isBuffering()) {
      setDrift((prev) => (prev !== null && Math.abs(prev - d.drift) < 0.05 ? prev : d.drift));
      driftLog.push(Math.abs(d.drift) * 1000);
      if (driftLog.length > 600) driftLog.shift();
      reportWindow.push(d.drift * 1000);
      if (Date.now() - lastDriftReport > DRIFT_REPORT_MS) {
        lastDriftReport = Date.now();
        reportDrift();
      }
    } else if (!st.playing) {
      setDrift(null);
    }
    a.setRate?.(d.rate);
    if (d.seekTo !== null) {
      a.seekTo(d.seekTo);
      lastSeekAt.current = Date.now();
      settlingTarget.current = st.playing ? d.seekTo : null;
      steadySince.current = null;
      if (d.trimmed) {
        trimsUsed.current += 1;
        console.log(`[couchlink] trim seek drift ms=${Math.round(d.drift * 1000)} lead ms=${Math.round(seekLead.current * 1000)}`);
      }
    }
  }, []);

  // A fresh command from anyone: allow an immediate correction, then keep ticking.
  useEffect(() => {
    if (!inSession) return;
    lastSeekAt.current = 0;
    settlingTarget.current = null;
    trimsUsed.current = 0;
    steadySince.current = null;
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
