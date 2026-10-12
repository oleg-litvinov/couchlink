import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DefaultFocus, SpatialNavigationView } from 'react-tv-space-navigation';
import { scaledPixels } from '../../hooks/useScale';
import { Card } from '../../session/protocol';
import { formatTime } from '../../session/sync';
import { Avatar, CouchButton, brand, ui } from './ui';

export const ASK_SUGGESTIONS = ['Who is that?', 'What did I miss?', "What's going on right now?"];

/** Big centered countdown for the synchronized start. */
export function Countdown({ seconds, title }: { seconds: number; title?: string }) {
  return (
    <View style={styles.center} pointerEvents="none">
      <Text style={ui.caption}>STARTING TOGETHER</Text>
      {title ? <Text style={[ui.h2, { marginTop: scaledPixels(10) }]}>{title}</Text> : null}
      <Text style={styles.count}>{seconds}</Text>
    </View>
  );
}

/** Answer to a mid-show question, shown on every TV while playback is paused. */
export function AnswerCard({ card, onResume, onDismiss }: { card: Card; onResume: () => void; onDismiss: () => void }) {
  return (
    <View style={styles.cardWrap}>
      <View style={[ui.panel, styles.card]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scaledPixels(18) }}>
          <Avatar name={card.by} size={48} />
          <Text style={[ui.h3, { marginStart: scaledPixels(16), flex: 1 }]} numberOfLines={2}>
            {card.by}: "{card.question}"
          </Text>
        </View>
        <Text style={styles.answer}>{card.answer}</Text>
        <Text style={[ui.caption, { marginTop: scaledPixels(18) }]}>
          AI answer · spoiler-safe up to {formatTime(card.position)}
        </Text>
        <SpatialNavigationView direction="horizontal" style={{ flexDirection: 'row', marginTop: scaledPixels(28) }}>
          <DefaultFocus>
            <CouchButton label="Resume for everyone" variant="primary" onSelect={onResume} />
          </DefaultFocus>
          <CouchButton label="Close" variant="ghost" onSelect={onDismiss} />
        </SpatialNavigationView>
      </View>
    </View>
  );
}

export function Thinking({ question, by }: { question?: string; by?: string }) {
  return (
    <View style={styles.cardWrap} pointerEvents="none">
      <View style={[ui.panel, styles.card]}>
        <Text style={ui.h3}>
          {by ? `${by} asked` : 'Asked'}: "{question}"
        </Text>
        <Text style={[ui.body, { marginTop: scaledPixels(14), color: brand.accent }]}>Thinking...</Text>
      </View>
    </View>
  );
}

/** Ask without a voice assistant: three suggestion chips. */
export function AskPanel({ onAsk, onClose }: { onAsk: (q: string) => void; onClose: () => void }) {
  return (
    <View style={styles.askWrap}>
      <Text style={[ui.h3, { marginBottom: scaledPixels(16) }]}>Ask about this scene</Text>
      <SpatialNavigationView direction="horizontal" style={{ flexDirection: 'row' }}>
        {ASK_SUGGESTIONS.map((q, i) =>
          i === 0 ? (
            <DefaultFocus key={q}>
              <CouchButton label={q} onSelect={() => onAsk(q)} />
            </DefaultFocus>
          ) : (
            <CouchButton key={q} label={q} onSelect={() => onAsk(q)} />
          ),
        )}
        <CouchButton label="Cancel" variant="ghost" onSelect={onClose} />
      </SpatialNavigationView>
      <Text style={[ui.caption, { marginTop: scaledPixels(14) }]}>Or say "Alexa, ask CouchLink who is that?"</Text>
    </View>
  );
}

export function SyncBadge({ drift, members }: { drift: number | null; members: string[] }) {
  const ok = drift === null || Math.abs(drift) < 0.5;
  return (
    <View style={styles.badge} pointerEvents="none">
      {members.map((m) => (
        <View key={m} style={{ marginEnd: scaledPixels(-8) }}>
          <Avatar name={m} size={36} />
        </View>
      ))}
      <View style={[styles.dot, { backgroundColor: ok ? '#34C759' : '#FFB547' }]} />
      <Text style={styles.badgeText}>
        {ok ? 'In sync' : 'Syncing'}
        {drift !== null ? ` · ${Math.round(Math.abs(drift) * 1000)} ms` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 20 },
  count: { color: '#fff', fontSize: scaledPixels(240), fontWeight: '900' },
  cardWrap: { position: 'absolute', right: scaledPixels(70), bottom: scaledPixels(70), zIndex: 30 },
  card: { width: scaledPixels(760) },
  answer: { color: '#fff', fontSize: scaledPixels(34), lineHeight: scaledPixels(48), fontWeight: '600' },
  askWrap: {
    position: 'absolute',
    left: scaledPixels(70),
    right: scaledPixels(70),
    bottom: scaledPixels(70),
    backgroundColor: brand.panel,
    borderRadius: scaledPixels(24),
    padding: scaledPixels(36),
    zIndex: 30,
  },
  badge: {
    position: 'absolute',
    top: scaledPixels(40),
    right: scaledPixels(60),
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: scaledPixels(30),
    paddingVertical: scaledPixels(8),
    paddingHorizontal: scaledPixels(16),
    zIndex: 15,
  },
  dot: { width: scaledPixels(14), height: scaledPixels(14), borderRadius: scaledPixels(7), marginStart: scaledPixels(22) },
  badgeText: { color: '#fff', fontSize: scaledPixels(20), fontWeight: '700', marginStart: scaledPixels(10) },
});
