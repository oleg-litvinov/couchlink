import { ClientMsg, ServerMsg } from './protocol';

type Listener = (msg: ServerMsg) => void;
type StatusListener = (connected: boolean) => void;

const PING_INTERVAL_MS = 15000;
const CLOCK_SAMPLES = 8;

/**
 * One WebSocket to the session service with:
 * - automatic reconnect (exponential backoff + jitter) and transparent re-join
 * - NTP-style clock offset estimate so every TV agrees on "server now"
 * - a send queue while (re)connecting
 */
export class SessionClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private queue: string[] = [];
  private samples: { rtt: number; offset: number }[] = [];
  private offsetMs = 0;
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private membership: { code: string; name: string } | null = null;
  connected = false;

  constructor(private readonly url: string) {}

  connect(): void {
    this.closedByUser = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.setConnected(true);
      // Burst of pings to get a good clock estimate quickly.
      for (let i = 0; i < 5; i++) setTimeout(() => this.ping(), i * 150);
      this.pingTimer = setInterval(() => this.ping(), PING_INTERVAL_MS);
      if (this.membership) {
        ws.send(JSON.stringify({ type: 'join', ...this.membership, rejoin: true }));
      }
      const pending = this.queue;
      this.queue = [];
      pending.forEach((m) => ws.send(m));
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.type === 'pong') {
        this.onPong(msg.t0, msg.serverTime);
        return;
      }
      if (msg.type === 'joined') this.membership = { code: msg.code, name: msg.you };
      if (msg.type === 'left' || (msg.type === 'error' && msg.code === 'NOT_FOUND')) this.membership = null;
      if ('serverTime' in msg && typeof msg.serverTime === 'number' && this.samples.length === 0) {
        this.offsetMs = msg.serverTime - Date.now(); // coarse until pings return
      }
      this.listeners.forEach((l) => l(msg));
    };
    ws.onclose = () => {
      this.cleanupTimers();
      this.setConnected(false);
      if (!this.closedByUser) this.scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose follows; reconnect handled there.
    };
  }

  close(): void {
    this.closedByUser = true;
    this.membership = null;
    this.cleanupTimers();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(msg: ClientMsg): void {
    const raw = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(raw);
    else {
      this.queue.push(raw);
      this.connect();
    }
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Current time on the server clock, in ms. */
  serverNow(): number {
    return Date.now() + this.offsetMs;
  }

  get clockOffsetMs(): number {
    return this.offsetMs;
  }

  get bestRttMs(): number | null {
    return this.samples.length ? Math.min(...this.samples.map((s) => s.rtt)) : null;
  }

  private ping(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping', t0: Date.now() }));
    }
  }

  private onPong(t0: number, serverTime: number): void {
    const now = Date.now();
    const rtt = now - t0;
    this.samples.push({ rtt, offset: serverTime + rtt / 2 - now });
    if (this.samples.length > CLOCK_SAMPLES) this.samples.shift();
    // The lowest-RTT sample has the least asymmetric delay: trust it.
    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.offsetMs = best.offset;
  }

  private scheduleReconnect(): void {
    const delay = Math.min(8000, 500 * 2 ** this.attempt) * (0.5 + Math.random() / 2);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private cleanupTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private setConnected(v: boolean): void {
    this.connected = v;
    this.statusListeners.forEach((l) => l(v));
  }
}
