import { Platform } from 'react-native';

/**
 * Where the CouchLink session service lives.
 *
 * - Local dev: `backend/local_server.py` on ws://localhost:8787/ws
 * - Deployed: the `WebSocketUrl` output of `sam deploy` (paste it into PROD_WS_URL)
 * - Web: `?ws=wss://...` overrides both, handy for demos.
 */
export const PROD_WS_URL = '';

const LOCAL_WS_URL =
  Platform.OS === 'android' ? 'ws://10.0.2.2:8787/ws' : 'ws://localhost:8787/ws';

function webParam(name: string): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function wsUrl(): string {
  const override = webParam('ws');
  if (override) return override;
  const env =
    typeof process !== 'undefined' && process.env ? process.env.EXPO_PUBLIC_COUCHLINK_WS_URL : undefined;
  if (env) return env;
  if (PROD_WS_URL && !(Platform.OS === 'web' && window.location.hostname === 'localhost')) return PROD_WS_URL;
  return LOCAL_WS_URL;
}

/** Web-only deep-link params: ?name=Alex&code=123456 */
export const launchParams = {
  name: webParam('name'),
  code: webParam('code'),
};

export const PROFILES = ['Alex', 'Sam', 'Mom', 'Dad', 'Grandma', 'Grandpa'];
