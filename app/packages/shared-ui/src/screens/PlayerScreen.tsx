import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { SpatialNavigationRoot } from 'react-tv-space-navigation';
import { useIsFocused } from '@react-navigation/native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import RemoteControlManager from '../app/remote-control/RemoteControlManager';
import { SupportedKeys } from '../app/remote-control/SupportedKeys';
import VideoOverlay from '../components/player/VideoOverlay';
import { VideoRef } from 'react-native-video';
import VideoPlayer from '../components/player/VideoPlayer';
import { RootStackParamList } from '../navigation/types';
import { useSession } from '../session/SessionContext';
import { useSyncedPlayback } from '../session/useSyncedPlayback';
import { getTitle } from '../data/catalog';
import Toasts from '../components/couch/Toasts';
import { AnswerCard, AskPanel, Countdown, SyncBadge, TapToJoin, Thinking } from '../components/couch/PlayerChrome';

const SHOW_NATIVE_CONTROLS = false;

type PlayerScreenRouteProp = RouteProp<RootStackParamList, 'Player'>;
type PlayerScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Player'>;

export default function PlayerScreen() {
  const route = useRoute<PlayerScreenRouteProp>();
  const navigation = useNavigation<PlayerScreenNavigationProp>();
  const title = getTitle(route.params.mediaId);
  const movie = title?.videoUrl ?? route.params.movie ?? '';
  const headerImage = title?.posterUrl ?? route.params.headerImage ?? '';
  const isFocused = useIsFocused();
  const session = useSession();

  const [soloPaused, setSoloPaused] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(false);
  const [askOpen, setAskOpen] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [rate, setRate] = useState(1);
  const videoRef = useRef<VideoRef>(null);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const bufferingRef = useRef(false);

  const sync = useSyncedPlayback({
    mediaId: route.params.mediaId,
    getTime: () => currentTimeRef.current,
    seekTo: (t) => {
      videoRef.current?.seek(t);
      currentTimeRef.current = t;
      setCurrentTime(t);
    },
    isBuffering: () => bufferingRef.current,
    setRate,
  });
  const paused = sync.inSession ? sync.paused : soloPaused;
  const shouldPlay = sync.inSession && !paused && sync.countdown === null;

  // Browsers refuse play() until the viewer has interacted with the page (e.g. a TV
  // that joined from a link). Keep retrying, and ask for one key press meanwhile.
  const [needsTap, setNeedsTap] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || !shouldPlay) {
      setNeedsTap(false);
      return;
    }
    const id = setInterval(() => {
      const v = document.querySelector('video');
      if (!v || !v.paused) return;
      v.play().then(
        () => setNeedsTap(false),
        () => setNeedsTap(true),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [shouldPlay]);

  const overlayOpen = askOpen || !!session.card || session.thinking?.what === 'ask';

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
    hideControlsTimeoutRef.current = setTimeout(() => setControlsVisible(false), 5000);
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      if (sync.inSession) sync.seekBy(delta);
      else {
        const t = Math.min(Math.max(0, currentTimeRef.current + delta), durationRef.current || Infinity);
        videoRef.current?.seek(t);
        currentTimeRef.current = t;
        setCurrentTime(t);
      }
      showControls();
    },
    [sync, showControls],
  );

  const togglePausePlay = useCallback(() => {
    if (sync.inSession) sync.togglePlay();
    else setSoloPaused((p) => !p);
    showControls();
  }, [sync, showControls]);

  const exit = useCallback(() => {
    if (sync.inSession) session.stop(); // ends the movie for everyone; auto-nav returns to the lobby
    else navigation.goBack();
  }, [sync.inSession, session, navigation]);

  const ask = useCallback(
    (q: string) => {
      setAskOpen(false);
      session.ask(q);
    },
    [session],
  );

  useEffect(() => {
    if (overlayOpen) return; // focus belongs to the overlay
    const handleKeyDown = (key: SupportedKeys) => {
      switch (key) {
        case SupportedKeys.Right:
        case SupportedKeys.FastForward:
          if (!controlsVisible) seekBy(10);
          else showControls();
          break;
        case SupportedKeys.Left:
        case SupportedKeys.Rewind:
          if (!controlsVisible) seekBy(-10);
          else showControls();
          break;
        case SupportedKeys.Back:
          exit();
          break;
        case SupportedKeys.PlayPause:
          togglePausePlay();
          break;
        default:
          showControls();
          break;
      }
    };
    const listener = RemoteControlManager.addKeydownListener(handleKeyDown);
    return () => RemoteControlManager.removeKeydownListener(listener);
  }, [seekBy, togglePausePlay, showControls, exit, overlayOpen, controlsVisible]);

  return (
    <SpatialNavigationRoot isActive={isFocused}>
      <View style={playerStyles.container}>
        <VideoPlayer
          ref={videoRef}
          movie={movie}
          headerImage={headerImage}
          paused={paused || sync.countdown !== null}
          rate={rate}
          controls={SHOW_NATIVE_CONTROLS}
          onBuffer={(b) => {
            bufferingRef.current = b;
            setIsVideoBuffering(b);
          }}
          onProgress={(t) => {
            currentTimeRef.current = t;
            setCurrentTime(t);
          }}
          onLoad={(duration) => (durationRef.current = duration)}
          onEnd={() => (sync.inSession ? session.stop() : navigation.goBack())}
        />

        {sync.inSession && <SyncBadge drift={sync.drift} members={session.members} />}
        {sync.countdown !== null && <Countdown seconds={sync.countdown} title={title?.title} />}
        {needsTap && <TapToJoin title={title?.title} />}

        {!overlayOpen && !!durationRef.current && (
          <VideoOverlay
            visible={controlsVisible || paused}
            paused={paused}
            onPlayPause={togglePausePlay}
            onExit={exit}
            onAsk={sync.inSession ? () => setAskOpen(true) : undefined}
            currentTime={currentTime}
            duration={durationRef.current}
            isBuffering={isVideoBuffering}
          />
        )}

        {askOpen && <AskPanel onAsk={ask} onClose={() => setAskOpen(false)} />}
        {session.thinking?.what === 'ask' && !session.card && (
          <Thinking question={session.thinking.question} by={session.thinking.by} />
        )}
        {session.card && (
          <AnswerCard
            card={session.card}
            onResume={() => {
              session.dismissCard();
              session.play(currentTimeRef.current);
            }}
            onDismiss={session.dismissCard}
          />
        )}
        <Toasts />
      </View>
    </SpatialNavigationRoot>
  );
}

const playerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
});

