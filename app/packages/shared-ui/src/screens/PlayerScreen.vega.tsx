import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, BackHandler, Text } from 'react-native';
import { DefaultFocus, SpatialNavigationRoot } from 'react-tv-space-navigation';
import { useIsFocused } from '@react-navigation/native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  IKeplerAppStateManager,
  useKeplerAppStateManager,
} from '@amazon-devices/react-native-kepler';
import { VideoPlayer as W3CVideoPlayer } from '@amazon-devices/react-native-w3cmedia';
import RemoteControlManager from '../app/remote-control/RemoteControlManager';
import { SupportedKeys } from '../app/remote-control/SupportedKeys';
import VideoOverlay from '../components/player/VideoOverlay.vega';
import ExitButton from '../components/player/ExitButton';
import VideoPlayer from '../components/player/VideoPlayer.vega';
import { RootStackParamList } from '../navigation/types';
import { VideoHandler } from '../utils/VideoHandler.kepler';
import { useSession } from '../session/SessionContext';
import { useSyncedPlayback } from '../session/useSyncedPlayback';
import { getTitle } from '../data/catalog';
import Toasts from '../components/couch/Toasts';
import { AnswerCard, AskPanel, Countdown, SyncBadge, Thinking } from '../components/couch/PlayerChrome';
import { CouchButton, ui } from '../components/couch/ui';
import { mediaRetryDelay } from '../session/mediaRetry';

type PlayerScreenRouteProp = RouteProp<RootStackParamList, 'Player'>;
type PlayerScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Player'
>;

/**
 * PlayerScreen for Vega/Kepler Platform
 *
 * This Kepler-specific player screen uses W3C Media APIs and Amazon's
 * native video rendering stack for optimal Fire TV performance.
 *
 * Key differences from standard PlayerScreen:
 * - Uses VideoHandler class for video lifecycle management
 * - Uses W3C Media VideoPlayer instead of react-native-video
 * - Integrates with Kepler Media Controls (KMC)
 * - Uses KeplerVideoSurfaceView for hardware-accelerated rendering
 * - Handles Fire TV remote control events
 */
export default function PlayerScreen() {
  const route = useRoute<PlayerScreenRouteProp>();
  const navigation = useNavigation<PlayerScreenNavigationProp>();
  const title = getTitle(route.params.mediaId);
  const movie = title?.videoUrl ?? route.params.movie ?? '';
  const headerImage = title?.posterUrl ?? route.params.headerImage ?? '';
  const session = useSession();
  const [askOpen, setAskOpen] = useState(false);
  const isFocused = useIsFocused();

  // Kepler-specific hooks
  const keplerAppStateManager: IKeplerAppStateManager =
    useKeplerAppStateManager();
  const componentInstance = keplerAppStateManager.getComponentInstance();

  // Video state
  const [paused, setPaused] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState<boolean>(true);
  const [isVideoInitialized, setIsVideoInitialized] = useState<boolean>(false);
  const [isVideoEnded, setIsVideoEnded] = useState<boolean>(false);
  const [isVideoError, setIsVideoError] = useState<boolean>(false);
  const [loadFailures, setLoadFailures] = useState(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  // Refs
  const videoRef = useRef<W3CVideoPlayer | null>(null);
  const surfaceHandleRef = useRef<string | null>(null);
  const captionViewHandleRef = useRef<string | null>(null);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const videoHandlerRef = useRef<VideoHandler | null>(null);
  const bufferingRef = useRef(true);
  // State, not a ref: the shared play state must be applied again once the surface is ready.
  const [surfaceReady, setSurfaceReady] = useState(false);

  const sync = useSyncedPlayback({
    mediaId: route.params.mediaId,
    getTime: () => videoRef.current?.currentTime ?? currentTimeRef.current,
    seekTo: (t) => {
      videoHandlerRef.current?.seek(Math.max(0, t));
      currentTimeRef.current = t;
      setCurrentTime(t);
    },
    isBuffering: () => bufferingRef.current,
    // Vega's player jumps 1-2 s on resume and stalls for seconds after every seek, and a
    // playbackRate change flushes the pipeline like a seek (friction log #11). So: no speed
    // nudging here, and only re-seek when drift exceeds 2.5 s.
    seekThreshold: 2.5,
  });
  const overlayOpen = askOpen || !!session.card || session.thinking?.what === 'ask';

  useEffect(() => {
    bufferingRef.current = isVideoBuffering;
  }, [isVideoBuffering]);

  // Apply the shared play/pause state (and hold during the synchronized countdown).
  useEffect(() => {
    if (!sync.inSession || !surfaceReady || !videoRef.current) return;
    const shouldPause = sync.paused || sync.countdown !== null;
    try {
      if (shouldPause && !videoRef.current.paused) videoRef.current.pause();
      if (!shouldPause && videoRef.current.paused) videoRef.current.play();
      setPaused(shouldPause);
    } catch (e) {
      console.warn('[PlayerScreen.kepler] sync apply error:', e);
    }
    // A (re)loaded player or a late surface must pick up the shared state too.
  }, [sync.inSession, sync.paused, sync.countdown, isVideoInitialized, surfaceReady]);

  // Update refs when state changes
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  /**
   * Show controls with auto-hide
   */
  const showControls = useCallback(() => {
    setControlsVisible(true);

    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 5000);
  }, []);

  /**
   * Seek to a specific time
   */
  const seek = useCallback((time: number) => {
    if (sync.inSession) {
      session.seek(Math.max(0, time));
      showControls();
      return;
    }
    if (videoHandlerRef.current && durationRef.current) {
      try {
        const clampedTime = Math.max(0, Math.min(time, durationRef.current));
        videoHandlerRef.current.seek(clampedTime);
        setCurrentTime(clampedTime);
        currentTimeRef.current = clampedTime;
        showControls();
      } catch (e) {
        console.warn('[PlayerScreen.kepler] Seek error:', e);
      }
    }
  }, [showControls, sync.inSession, session]);

  /**
   * Toggle play/pause
   */
  const togglePausePlay = useCallback(() => {
    if (sync.inSession) {
      sync.togglePlay();
      showControls();
      return;
    }
    if (videoHandlerRef.current) {
      try {
        if (videoHandlerRef.current.isPaused()) {
          videoHandlerRef.current.play();
          setPaused(false);
        } else {
          videoHandlerRef.current.pause();
          setPaused(true);
        }
        showControls();
      } catch (e) {
        console.warn('[PlayerScreen.kepler] Play/pause error:', e);
      }
    }
  }, [showControls, sync]);

  /**
   * Navigate back with cleanup
   */
  const navigateBack = useCallback(() => {
    console.log('[PlayerScreen.kepler] - Navigating back');
    if (sync.inSession) {
      // Ends the movie for everyone; SessionAutoNav returns every TV to the lobby.
      session.stop();
      return;
    }

    // Clear surface and caption handles
    if (surfaceHandleRef.current && videoRef.current) {
      videoRef.current.clearSurfaceHandle(surfaceHandleRef.current);
    }
    if (captionViewHandleRef.current && videoRef.current) {
      videoRef.current.clearCaptionViewHandle(captionViewHandleRef.current);
    }

    // Destroy video elements
    videoHandlerRef.current?.destroyVideoElements();
    videoRef.current = null;

    // Navigate back after short delay
    setTimeout(() => {
      navigation.goBack();
    }, 300);
  }, [navigation, sync.inSession, session]);

  /**
   * Initialize video handler and start playback
   */
  useEffect(() => {
    if (!isFocused) return;

    console.log('[PlayerScreen.kepler] - Initializing video handler');

    // Create video handler
    videoHandlerRef.current = new VideoHandler(
      videoRef,
      movie,
      headerImage,
      setIsVideoInitialized,
      setIsVideoEnded,
      setIsVideoError,
      setCurrentTime,
      setDuration,
      setIsVideoBuffering,
    );

    // Start pre-buffering video
    videoHandlerRef.current.preBufferVideo(componentInstance);

    return () => {
      // Cleanup on unmount
      console.log('[PlayerScreen.kepler] - Cleaning up video handler');
      if (surfaceHandleRef.current && videoRef.current) {
        videoRef.current.clearSurfaceHandle(surfaceHandleRef.current);
      }
      if (captionViewHandleRef.current && videoRef.current) {
        videoRef.current.clearCaptionViewHandle(captionViewHandleRef.current);
      }
      videoHandlerRef.current?.destroyVideoElements();
      videoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie, headerImage, isFocused]);

  // Reload the source on the same player, like a browser's video.load(). Tearing the player and
  // its surface down and re-creating them stalled the second instance on Vega.
  const retryLoad = useCallback(() => {
    setIsVideoError(false);
    setIsVideoInitialized(false);
    setIsVideoBuffering(true);
    videoHandlerRef.current?.loadVideoElements();
  }, []);

  // A failed load used to leave the TV on a blank error screen for good (friction log #12):
  // retry with backoff, then let the viewer try again or exit.
  useEffect(() => {
    if (!isVideoError) return;
    const delay = mediaRetryDelay(loadFailures + 1);
    if (delay === null) return;
    console.log(`[couchlink] media load failed; retry ${loadFailures + 1} in ${delay} ms`);
    const t = setTimeout(() => {
      setLoadFailures((f) => f + 1);
      retryLoad();
    }, delay);
    return () => clearTimeout(t);
  }, [isVideoError, loadFailures, retryLoad]);

  useEffect(() => {
    if (isVideoInitialized) setLoadFailures(0);
  }, [isVideoInitialized]);

  // Anyone starting the title again is a fresh chance: reset the budget and retry right away.
  const loadSeq = session.state?.action === 'load' ? session.state.seq : null;
  const videoErrorRef = useRef(false);
  videoErrorRef.current = isVideoError;
  useEffect(() => {
    if (loadSeq === null) return;
    setLoadFailures(0);
    if (videoErrorRef.current) retryLoad();
  }, [loadSeq, retryLoad]);

  /**
   * Handle video end - pause, show controls, and navigate back
   */
  useEffect(() => {
    if (isVideoEnded) {
      if (sync.inSession) {
        session.stop();
        return;
      }
      setPaused(true);
      setControlsVisible(true);
      navigateBack();
    }
  }, [isVideoEnded, navigateBack, sync.inSession, session]);

  /**
   * Show controls when video starts
   */
  useEffect(() => {
    if (isVideoInitialized && duration > 0) {
      showControls();
    }
  }, [isVideoInitialized, duration, showControls]);

  /**
   * Handle remote control key presses
   */
  // Handlers change on every render; read them through a ref so the key listener is
  // registered once per overlay state instead of being torn down and re-added constantly.
  const keyHandlers = useRef({ seek, togglePausePlay, showControls, navigateBack });
  keyHandlers.current = { seek, togglePausePlay, showControls, navigateBack };

  useEffect(() => {
    if (overlayOpen) return; // focus belongs to the Ask panel / answer card
    const handleKeyDown = (key: SupportedKeys) => {
      const h = keyHandlers.current;
      try {
        switch (key) {
          case SupportedKeys.Right:
          case SupportedKeys.FastForward:
            h.seek(currentTimeRef.current + 10);
            break;
          case SupportedKeys.Left:
          case SupportedKeys.Rewind:
            h.seek(currentTimeRef.current - 10);
            break;
          case SupportedKeys.Back:
            h.navigateBack();
            break;
          case SupportedKeys.PlayPause:
            h.togglePausePlay();
            break;
          default:
            h.showControls();
            break;
        }
      } catch (e) {
        console.error('[PlayerScreen.kepler] Key handler error:', e);
      }
    };

    const listener = RemoteControlManager.addKeydownListener(handleKeyDown);

    // Setup hardware back button listener
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        keyHandlers.current.navigateBack();
        return true;
      },
    );

    return () => {
      RemoteControlManager.removeKeydownListener(listener);
      backHandler.remove();
    };
  }, [overlayOpen]);

  /**
   * Handle surface view creation
   */
  const onSurfaceViewCreated = useCallback((surfaceHandle: string) => {
    console.log('[PlayerScreen.kepler] - Surface view created:', surfaceHandle);
    surfaceHandleRef.current = surfaceHandle;

    // Set surface handle on video player
    if (videoRef.current) {
      videoRef.current.setSurfaceHandle(surfaceHandle);
      setSurfaceReady(true);
      // In a session the sync effect decides play/pause; solo playback starts now.
      if (!sync.inSession) {
        videoRef.current.play();
        setPaused(false);
      }
    }
  }, [sync.inSession]);

  /**
   * Handle surface view destruction
   */
  const onSurfaceViewDestroyed = useCallback((surfaceHandle: string) => {
    console.log(
      '[PlayerScreen.kepler] - Surface view destroyed:',
      surfaceHandle,
    );
    if (videoRef.current) {
      videoRef.current.clearSurfaceHandle(surfaceHandle);
    }
    surfaceHandleRef.current = null;
    setSurfaceReady(false);
  }, []);

  /**
   * Handle caption view creation
   */
  const onCaptionViewCreated = useCallback((captionHandle: string) => {
    console.log('[PlayerScreen.kepler] - Caption view created:', captionHandle);
    captionViewHandleRef.current = captionHandle;

    if (videoRef.current) {
      videoRef.current.setCaptionViewHandle(captionHandle);
    }
  }, []);

  /**
   * Handle caption view destruction
   */
  const onCaptionViewDestroyed = useCallback((captionHandle: string) => {
    console.log(
      '[PlayerScreen.kepler] - Caption view destroyed:',
      captionHandle,
    );
    if (videoRef.current) {
      videoRef.current.clearCaptionViewHandle(captionHandle);
    }
    captionViewHandleRef.current = null;
  }, []);

  const styles = usePlayerStyles();

  return (
    <SpatialNavigationRoot isActive={isFocused}>
      <View style={styles.container}>
        {/* Kepler Video Player with native surface rendering */}
        <VideoPlayer
          movie={movie}
          headerImage={headerImage}
          showCaptions={false}
          onSurfaceViewCreated={onSurfaceViewCreated}
          onSurfaceViewDestroyed={onSurfaceViewDestroyed}
          onCaptionViewCreated={onCaptionViewCreated}
          onCaptionViewDestroyed={onCaptionViewDestroyed}
          isVideoInitialized={isVideoInitialized}
        />

        {sync.inSession && <SyncBadge drift={sync.drift} members={session.members} />}
        {sync.countdown !== null && <Countdown seconds={sync.countdown} title={title?.title} />}

        {/* Custom controls overlay with buffering indicator */}
        {!overlayOpen && !isVideoError && !!durationRef.current && (
          <VideoOverlay
            visible={controlsVisible || paused}
            paused={paused}
            onPlayPause={togglePausePlay}
            onExit={navigateBack}
            onAsk={sync.inSession ? () => setAskOpen(true) : undefined}
            currentTime={currentTime}
            duration={durationRef.current}
            isBuffering={isVideoBuffering}
          />
        )}

        {askOpen && (
          <AskPanel
            onAsk={(q) => {
              setAskOpen(false);
              session.ask(q);
            }}
            onClose={() => setAskOpen(false)}
          />
        )}
        {session.thinking?.what === 'ask' && !session.card && (
          <Thinking question={session.thinking.question} by={session.thinking.by} />
        )}
        {session.card && (
          <AnswerCard
            card={session.card}
            onResume={() => {
              session.dismissCard();
              session.play(videoRef.current?.currentTime ?? currentTimeRef.current);
            }}
            onDismiss={session.dismissCard}
          />
        )}
        {/* Overlay rather than replace the player: it must stay mounted to retry the load. */}
        {isVideoError && (
          <View style={styles.errorContainer}>
            <ExitButton onSelect={navigateBack} />
            <Text style={ui.h2}>Couldn't load the video</Text>
            {mediaRetryDelay(loadFailures + 1) !== null ? (
              <Text style={ui.body}>Trying again...</Text>
            ) : (
              <>
                <Text style={ui.body}>Check the connection, then try again.</Text>
                <DefaultFocus>
                  <CouchButton
                    label="Try again"
                    variant="primary"
                    onSelect={() => {
                      setLoadFailures(0);
                      retryLoad();
                    }}
                  />
                </DefaultFocus>
              </>
            )}
          </View>
        )}
        <Toasts />
      </View>
    </SpatialNavigationRoot>
  );
}

const usePlayerStyles = () => {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
    },
    errorContainer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#000',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10,
    },
  });
};
