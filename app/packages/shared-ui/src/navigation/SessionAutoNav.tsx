import { useEffect, useRef } from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from './types';
import { useSession } from '../session/SessionContext';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Moves every TV to the same screen when the shared session changes phase:
 * picks ready -> Lobby, movie started -> Player, movie ended -> Lobby, left -> Home.
 */
export default function SessionAutoNav() {
  const { code, state } = useSession();
  const prev = useRef<{ phase?: string; mediaId?: string | null; code?: string | null }>({});

  useEffect(() => {
    if (!navigationRef.isReady()) return;
    const route = navigationRef.getCurrentRoute();
    const p = prev.current;
    const phase = state?.phase;
    const mediaId = state?.mediaId ?? null;

    if (!code) {
      if (p.code && (route?.name === 'Lobby' || route?.name === 'Player')) {
        navigationRef.navigate('DrawerNavigator');
      }
    } else if (phase === 'watching' && mediaId) {
      const current = (route?.params as { mediaId?: string } | undefined)?.mediaId;
      if (route?.name !== 'Player' || current !== mediaId) navigationRef.navigate('Player', { mediaId });
    } else if (route?.name === 'Player') {
      navigationRef.navigate('Lobby');
    } else if (phase === 'picks' && p.phase !== 'picks' && route?.name !== 'Lobby') {
      navigationRef.navigate('Lobby');
    }
    prev.current = { phase, mediaId, code };
  }, [code, state?.phase, state?.mediaId]);

  return null;
}
