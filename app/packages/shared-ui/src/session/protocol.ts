// Wire protocol shared with backend/src/couchlink/core.py

export type PlaybackAction = 'play' | 'pause' | 'seek' | 'load' | 'stop' | 'create';

export interface PlaybackState {
  mediaId: string | null;
  playing: boolean;
  position: number; // seconds
  updatedAt: number; // server ms
  actor: string;
  action: PlaybackAction;
  seq: number;
  phase: 'lobby' | 'picks' | 'watching';
  picks: Pick[];
  host: string;
  reason?: string | null;
}

export interface Pick {
  mediaId: string;
  reason: string;
}

export type Votes = Record<string, Record<string, boolean>>;

export interface Snapshot {
  code: string;
  state: PlaybackState;
  members: string[];
  prefs: Record<string, string>;
  votes: Votes;
  serverTime: number;
}

export interface Card {
  question: string;
  answer: string;
  by: string;
  mediaId: string;
  position: number;
}

export type ServerMsg =
  | ({ type: 'joined'; you: string } & Snapshot)
  | ({ type: 'snapshot' } & Snapshot)
  | { type: 'pong'; t0: number; serverTime: number }
  | { type: 'state'; state: PlaybackState; serverTime: number }
  | { type: 'members'; members: string[]; event?: string }
  | { type: 'prefs'; prefs: Record<string, string>; event?: string }
  | { type: 'picks'; picks: Pick[]; prefs: Record<string, string>; by: string }
  | { type: 'votes'; votes: Votes; event?: string }
  | { type: 'match'; mediaId: string; title: string }
  | { type: 'thinking'; what: 'picks' | 'ask'; question?: string; by?: string }
  | ({ type: 'card' } & Card)
  | { type: 'toast'; event: string }
  | { type: 'left' }
  | { type: 'error'; code: string; message: string };

export type ClientMsg =
  | { type: 'ping'; t0: number }
  | { type: 'create'; name: string }
  | { type: 'join'; code: string; name: string; rejoin?: boolean }
  | { type: 'leave' }
  | { type: 'cmd'; action: 'play' | 'pause' | 'seek' | 'load' | 'stop'; position?: number; mediaId?: string }
  | { type: 'mood'; text: string }
  | { type: 'findPicks' }
  | { type: 'vote'; mediaId: string; up: boolean }
  | { type: 'ask'; question: string }
  | { type: 'sync' };
