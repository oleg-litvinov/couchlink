import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SessionClient } from './SessionClient';
import { wsUrl } from './config';
import { Card, PlaybackState, Pick, ServerMsg, Votes } from './protocol';
import { describeAction } from './sync';

export interface Toast {
  id: number;
  text: string;
}

export interface SessionValue {
  me: string | null;
  code: string | null;
  connected: boolean;
  members: string[];
  state: PlaybackState | null;
  prefs: Record<string, string>;
  votes: Votes;
  picks: Pick[];
  card: Card | null;
  thinking: { what: 'picks' | 'ask'; question?: string; by?: string } | null;
  toasts: Toast[];
  error: string | null;
  joining: boolean;

  setMe: (name: string) => void;
  createSession: (name?: string) => void;
  joinSession: (code: string, name?: string) => void;
  leaveSession: () => void;
  play: (position: number) => void;
  pause: (position: number) => void;
  seek: (position: number) => void;
  load: (mediaId: string) => void;
  stop: () => void;
  setMood: (text: string) => void;
  findPicks: () => void;
  vote: (mediaId: string, up: boolean) => void;
  ask: (question: string) => void;
  dismissCard: () => void;
  clearError: () => void;
  serverNow: () => number;
}

const SessionContext = createContext<SessionValue | null>(null);

let toastSeq = 0;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const clientRef = useRef<SessionClient | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [state, setState] = useState<PlaybackState | null>(null);
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [votes, setVotes] = useState<Votes>({});
  const [picks, setPicks] = useState<Pick[]>([]);
  const [card, setCard] = useState<Card | null>(null);
  const [thinking, setThinking] = useState<SessionValue['thinking']>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const meRef = useRef<string | null>(null);
  meRef.current = me;

  const toast = useCallback((text?: string | null) => {
    if (!text) return;
    const id = ++toastSeq;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const handle = useCallback(
    (msg: ServerMsg) => {
      switch (msg.type) {
        case 'joined':
        case 'snapshot':
          setCode(msg.code);
          setMembers(msg.members);
          setState(msg.state);
          setPrefs(msg.prefs);
          setVotes(msg.votes);
          setPicks(msg.state.picks || []);
          setJoining(false);
          setError(null);
          break;
        case 'state':
          setState(msg.state);
          if (msg.state.action === 'stop' || msg.state.action === 'play' || msg.state.action === 'load') setCard(null);
          // Don't echo our own actions back as banners.
          if (msg.state.actor !== meRef.current || msg.state.reason === 'match') toast(describeAction(msg.state));
          break;
        case 'members':
          setMembers(msg.members);
          if (msg.event !== `${meRef.current} joined`) toast(msg.event);
          break;
        case 'prefs':
          setPrefs(msg.prefs);
          toast(msg.event);
          break;
        case 'picks':
          setPicks(msg.picks);
          setVotes({});
          setThinking(null);
          setState((s) => (s ? { ...s, phase: 'picks', picks: msg.picks } : s));
          break;
        case 'votes':
          setVotes(msg.votes);
          break;
        case 'match':
          toast(`It's a match: ${msg.title}`);
          break;
        case 'thinking':
          setThinking({ what: msg.what, question: msg.question, by: msg.by });
          break;
        case 'card':
          setThinking(null);
          setCard({ question: msg.question, answer: msg.answer, by: msg.by, mediaId: msg.mediaId, position: msg.position });
          break;
        case 'toast':
          toast(msg.event);
          break;
        case 'left':
          setCode(null);
          break;
        case 'error':
          setJoining(false);
          setThinking(null);
          setError(msg.message);
          if (msg.code === 'NOT_FOUND') {
            setCode((c) => {
              if (c) toast('That party has ended');
              return null;
            });
            setState(null);
          }
          break;
      }
    },
    [toast],
  );

  const client = useCallback((): SessionClient => {
    if (!clientRef.current) {
      const c = new SessionClient(wsUrl());
      c.on(handle);
      c.onStatus(setConnected);
      clientRef.current = c;
    }
    return clientRef.current;
  }, [handle]);

  useEffect(() => () => clientRef.current?.close(), []);

  const value = useMemo<SessionValue>(() => {
    const send = (m: Parameters<SessionClient['send']>[0]) => client().send(m);
    return {
      me,
      code,
      connected,
      members,
      state,
      prefs,
      votes,
      picks,
      card,
      thinking,
      toasts,
      error,
      joining,
      setMe,
      createSession: (name?: string) => {
        setJoining(true);
        send({ type: 'create', name: name || meRef.current || 'Guest' });
      },
      joinSession: (c: string, name?: string) => {
        setJoining(true);
        send({ type: 'join', code: c, name: name || meRef.current || 'Guest' });
      },
      leaveSession: () => {
        send({ type: 'leave' });
        setCode(null);
        setState(null);
        setMembers([]);
        setPicks([]);
        setPrefs({});
        setVotes({});
        setCard(null);
      },
      play: (position) => send({ type: 'cmd', action: 'play', position }),
      pause: (position) => send({ type: 'cmd', action: 'pause', position }),
      seek: (position) => send({ type: 'cmd', action: 'seek', position }),
      load: (mediaId) => send({ type: 'cmd', action: 'load', mediaId }),
      stop: () => send({ type: 'cmd', action: 'stop' }),
      setMood: (text) => send({ type: 'mood', text }),
      findPicks: () => send({ type: 'findPicks' }),
      vote: (mediaId, up) => send({ type: 'vote', mediaId, up }),
      ask: (question) => send({ type: 'ask', question }),
      dismissCard: () => setCard(null),
      clearError: () => setError(null),
      serverNow: () => (clientRef.current ? clientRef.current.serverNow() : Date.now()),
    };
  }, [me, code, connected, members, state, prefs, votes, picks, card, thinking, toasts, error, joining, client]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
