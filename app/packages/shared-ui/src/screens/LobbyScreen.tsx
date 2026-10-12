import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  DefaultFocus,
  SpatialNavigationFocusableView,
  SpatialNavigationRoot,
  SpatialNavigationScrollView,
  SpatialNavigationView,
} from 'react-tv-space-navigation';
import { scaledPixels } from '../hooks/useScale';
import { RootStackParamList } from '../navigation/types';
import { useSession } from '../session/SessionContext';
import { getTitle, minutes } from '../data/catalog';
import { Avatar, CouchButton, Pill, brand, ui } from '../components/couch/ui';
import Toasts from '../components/couch/Toasts';
import { colors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MOODS: { label: string; text: string }[] = [
  { label: 'Funny', text: 'funny' },
  { label: 'Animated', text: 'animated' },
  { label: 'Scary', text: 'scary' },
  { label: 'Classic', text: 'a classic' },
  { label: 'Romantic', text: 'romantic' },
  { label: 'Sci-fi', text: 'sci-fi' },
  { label: 'Thrilling', text: 'thrilling' },
  { label: 'Weird', text: 'weird' },
  { label: 'Kids', text: 'good for kids' },
  { label: 'Short', text: 'under 30 minutes' },
];

export default function LobbyScreen() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const s = useSession();
  const [selected, setSelected] = useState<string[]>([]);
  const [editingMood, setEditingMood] = useState(false);

  const myMood = s.me ? s.prefs[s.me] : undefined;
  const showMoodPicker = editingMood || (!myMood && s.picks.length === 0);
  const waitingFor = s.members.filter((m) => !s.prefs[m]);

  const sendMood = () => {
    const parts = MOODS.filter((m) => selected.includes(m.label)).map((m) => m.text);
    if (!parts.length) return;
    s.setMood(`something ${parts.join(', ')}`);
    setEditingMood(false);
  };

  const prettyCode = s.code ? `${s.code.slice(0, 3)} ${s.code.slice(3)}` : '--- ---';

  return (
    <SpatialNavigationRoot isActive={isFocused}>
      <View style={styles.container}>
        {/* ---------------------------------------------------------------- left: party */}
        <View style={styles.left}>
          <Text style={styles.logo}>
            Couch<Text style={{ color: brand.accent }}>Link</Text>
          </Text>
          <Text style={ui.caption}>WATCH PARTY CODE</Text>
          <Text style={styles.code} numberOfLines={1} adjustsFontSizeToFit>
            {prettyCode}
          </Text>
          <Text style={[ui.body, { fontSize: scaledPixels(22), lineHeight: scaledPixels(32) }]}>
            On the other TV choose <Text style={{ color: '#fff' }}>Join a party</Text>, or say{'\n'}
            <Text style={{ color: brand.accent }}>"Alexa, tell CouchLink code {s.code}"</Text>
          </Text>

          <Text style={[ui.caption, { marginTop: scaledPixels(44) }]}>
            ON THE COUCH {s.connected ? '' : '(reconnecting...)'}
          </Text>
          {s.members.map((m) => (
            <View key={m} style={styles.member}>
              <Avatar name={m} size={64} />
              <View style={{ marginStart: scaledPixels(18), flex: 1 }}>
                <Text style={ui.h3}>
                  {m}
                  {m === s.me ? <Text style={ui.caption}>  (you)</Text> : null}
                </Text>
                <Text style={[ui.caption, s.prefs[m] && { color: colors.textSecondary }]} numberOfLines={2}>
                  {s.prefs[m] ? `"${s.prefs[m]}"` : 'Choosing a mood...'}
                </Text>
              </View>
            </View>
          ))}
          {s.members.length < 2 && <Text style={[ui.caption, { marginTop: scaledPixels(12) }]}>Waiting for someone to join...</Text>}
        </View>

        {/* ---------------------------------------------------------------- right: discovery */}
        <View style={styles.right}>
          {s.thinking?.what === 'picks' ? (
            <View style={styles.thinking}>
              <Text style={ui.h2}>Finding something you'll all love...</Text>
              <Text style={[ui.body, { marginTop: scaledPixels(16) }]}>
                Matching {Object.keys(s.prefs).join(' + ')} against the catalog
              </Text>
            </View>
          ) : showMoodPicker ? (
            <SpatialNavigationView direction="vertical">
              <Text style={ui.h2}>What are you in the mood for?</Text>
              <Text style={[ui.body, { marginTop: scaledPixels(8), marginBottom: scaledPixels(30) }]}>
                Pick a few, or just tell Alexa: "Alexa, tell CouchLink I want something funny".
              </Text>
              {[MOODS.slice(0, 5), MOODS.slice(5)].map((row, r) => (
                <SpatialNavigationView key={r} direction="horizontal" style={styles.chips}>
                  {row.map((m, i) => {
                    const on = selected.includes(m.label);
                    const chip = (
                      <SpatialNavigationFocusableView
                        key={m.label}
                        onSelect={() => setSelected((x) => (on ? x.filter((y) => y !== m.label) : [...x, m.label]))}
                      >
                        {({ isFocused: f }) => (
                          <View style={[styles.chip, on && styles.chipOn, f && styles.chipFocused]}>
                            <Text style={[styles.chipText, (f || on) && { color: f ? '#000' : '#fff' }]}>
                              {on ? '+ ' : ''}
                              {m.label}
                            </Text>
                          </View>
                        )}
                      </SpatialNavigationFocusableView>
                    );
                    return r === 0 && i === 0 ? <DefaultFocus key={m.label}>{chip}</DefaultFocus> : chip;
                  })}
                </SpatialNavigationView>
              ))}
              <SpatialNavigationView direction="horizontal" style={{ flexDirection: 'row', marginTop: scaledPixels(30) }}>
                <CouchButton label="That's my mood" variant="primary" onSelect={sendMood} disabled={!selected.length} />
                <CouchButton label="Browse titles" variant="ghost" onSelect={() => navigation.navigate('DrawerNavigator')} />
              </SpatialNavigationView>
            </SpatialNavigationView>
          ) : s.picks.length === 0 ? (
            <SpatialNavigationView direction="vertical">
              <Text style={ui.h2}>Got it: "{myMood}"</Text>
              <Text style={[ui.body, { marginVertical: scaledPixels(20) }]}>
                {waitingFor.length
                  ? `Waiting for ${waitingFor.join(' and ')}. Picks appear as soon as everyone has a mood.`
                  : 'Everyone is ready.'}
              </Text>
              <SpatialNavigationView direction="horizontal" style={{ flexDirection: 'row' }}>
                <DefaultFocus>
                  <CouchButton label="Find picks now" variant="primary" onSelect={s.findPicks} />
                </DefaultFocus>
                <CouchButton label="Change my mood" variant="ghost" onSelect={() => setEditingMood(true)} />
              </SpatialNavigationView>
            </SpatialNavigationView>
          ) : (
            <PicksRow onChangeMood={() => setEditingMood(true)} />
          )}
          {s.error && <Text style={[ui.body, { color: colors.error, marginTop: scaledPixels(20) }]}>{s.error}</Text>}
        </View>
        <Toasts position="bottom" />
      </View>
    </SpatialNavigationRoot>
  );
}

function PicksRow({ onChangeMood }: { onChangeMood: () => void }) {
  const s = useSession();
  const names = useMemo(() => Object.keys(s.prefs), [s.prefs]);
  return (
    <SpatialNavigationView direction="vertical">
      <Text style={ui.h2}>Picks for {names.length > 1 ? names.join(' & ') : 'you'}</Text>
      <Text style={[ui.body, { marginTop: scaledPixels(8), marginBottom: scaledPixels(24) }]}>
        Press OK on the ones you're in for. When everyone's in, it starts on every TV.
      </Text>
      <SpatialNavigationScrollView horizontal offsetFromStart={scaledPixels(40)}>
        <View style={{ flexDirection: 'row', paddingVertical: scaledPixels(20) }}>
          {s.picks.map((p, i) => {
            const t = getTitle(p.mediaId);
            if (!t) return null;
            const v = s.votes[p.mediaId] || {};
            const mine = s.me ? v[s.me] === true : false;
            const card = (
              <SpatialNavigationFocusableView key={p.mediaId} onSelect={() => s.vote(p.mediaId, !mine)}>
                {({ isFocused: f }) => (
                  <View style={[styles.pick, mine && styles.pickMine, f && styles.pickFocused]}>
                    <Image source={{ uri: t.posterUrl }} style={styles.pickImage} resizeMode="cover" />
                    <View style={{ padding: scaledPixels(18) }}>
                      <Text style={ui.h3} numberOfLines={1}>
                        {t.title}
                      </Text>
                      <Text style={ui.caption}>
                        {t.year} · {minutes(t)} · {t.genres.slice(0, 2).join(', ')}
                      </Text>
                      <Text style={[ui.body, styles.reason]} numberOfLines={3}>
                        {p.reason}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: scaledPixels(8) }}>
                        {s.members.map((m) => (
                          <View key={m} style={{ marginEnd: scaledPixels(8) }}>
                            <Avatar name={m} size={36} dim={v[m] !== true} />
                          </View>
                        ))}
                        <Text style={[ui.caption, { marginStart: scaledPixels(6) }]}>
                          {mine ? "You're in" : f ? 'OK = I\'m in' : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </SpatialNavigationFocusableView>
            );
            return i === 0 ? <DefaultFocus key={p.mediaId}>{card}</DefaultFocus> : card;
          })}
        </View>
      </SpatialNavigationScrollView>
      <View style={{ flexDirection: 'row', marginTop: scaledPixels(20), alignItems: 'center' }}>
        <Pill text="AI picks from our catalog only" tone="accent" />
        <SpatialNavigationView direction="horizontal" style={{ flexDirection: 'row' }}>
          <CouchButton label="Change my mood" variant="ghost" onSelect={onChangeMood} />
          <CouchButton label="New picks" variant="ghost" onSelect={s.findPicks} />
        </SpatialNavigationView>
      </View>
    </SpatialNavigationView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, flexDirection: 'row' },
  left: {
    width: scaledPixels(560),
    backgroundColor: '#0E0E11',
    paddingHorizontal: scaledPixels(60),
    paddingTop: scaledPixels(50),
  },
  logo: { color: '#fff', fontSize: scaledPixels(40), fontWeight: '900', marginBottom: scaledPixels(50) },
  code: { color: '#fff', fontSize: scaledPixels(92), fontWeight: '900', letterSpacing: scaledPixels(2), marginVertical: scaledPixels(6) },
  member: { flexDirection: 'row', alignItems: 'center', marginTop: scaledPixels(22) },
  right: { flex: 1, paddingHorizontal: scaledPixels(70), paddingTop: scaledPixels(150) },
  thinking: { marginTop: scaledPixels(120) },
  chips: { flexDirection: 'row' },
  chip: {
    paddingVertical: scaledPixels(18),
    paddingHorizontal: scaledPixels(34),
    borderRadius: scaledPixels(40),
    backgroundColor: colors.card,
    borderWidth: scaledPixels(3),
    borderColor: 'transparent',
    marginEnd: scaledPixels(18),
    marginBottom: scaledPixels(18),
  },
  chipOn: { backgroundColor: brand.accentSoft, borderColor: brand.accent },
  chipFocused: { backgroundColor: '#fff', borderColor: '#fff', transform: [{ scale: 1.06 }] },
  chipText: { color: colors.textSecondary, fontSize: scaledPixels(28), fontWeight: '700' },
  pick: {
    width: scaledPixels(380),
    marginEnd: scaledPixels(28),
    borderRadius: scaledPixels(18),
    backgroundColor: colors.card,
    overflow: 'hidden',
    borderWidth: scaledPixels(4),
    borderColor: 'transparent',
  },
  pickFocused: { borderColor: '#fff', transform: [{ scale: 1.05 }] },
  pickMine: { borderColor: brand.accent },
  pickImage: { width: '100%', height: scaledPixels(214), backgroundColor: '#222' },
  reason: { fontSize: scaledPixels(22), lineHeight: scaledPixels(30), marginTop: scaledPixels(8), minHeight: scaledPixels(90) },
});
